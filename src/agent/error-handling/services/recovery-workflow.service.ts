import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCategory, ErrorClassification, ErrorSeverity } from '../interfaces/error-handling.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { FallbackChainService } from './fallback-chain.service';
import { RetryService } from './retry.service';

export interface RecoveryWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: RecoveryTrigger;
  steps: RecoveryStep[];
  onSuccess?: () => Promise<void>;
  onFailure?: (error: Error) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface RecoveryTrigger {
  errorCategories?: ErrorCategory[];
  errorSeverities?: ErrorSeverity[];
  errorPatterns?: RegExp[];
  failureThreshold?: number;
  timeWindowMs?: number;
}

export interface RecoveryStep {
  name: string;
  description: string;
  action: () => Promise<void>;
  validation?: () => Promise<boolean>;
  rollback?: () => Promise<void>;
  continueOnFailure?: boolean;
}

export interface RecoveryExecution {
  workflowId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'success' | 'failed' | 'partial';
  completedSteps: string[];
  failedSteps: string[];
  error?: Error;
}

export interface RecoveryMetrics {
  totalExecutions: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  partialRecoveries: number;
  averageRecoveryTime: number;
  recoveryByWorkflow: Map<string, number>;
  errorPatterns: Map<string, number>;
}

@Injectable()
export class RecoveryWorkflowService {
  private readonly logger = new Logger(RecoveryWorkflowService.name);
  private readonly workflows = new Map<string, RecoveryWorkflow>();
  private readonly executions = new Map<string, RecoveryExecution>();
  private readonly errorHistory: Array<{ error: Error; timestamp: Date; classification: ErrorClassification }> = [];
  private readonly metrics: RecoveryMetrics = this.initializeMetrics();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly retryService: RetryService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly fallbackChainService: FallbackChainService,
  ) {
    this.startMonitoring();
    this.registerDefaultWorkflows();
  }

  private initializeMetrics(): RecoveryMetrics {
    return {
      totalExecutions: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      partialRecoveries: 0,
      averageRecoveryTime: 0,
      recoveryByWorkflow: new Map(),
      errorPatterns: new Map(),
    };
  }

  /**
   * Register a recovery workflow
   */
  registerWorkflow(workflow: RecoveryWorkflow): void {
    this.workflows.set(workflow.id, workflow);
    this.logger.log(`Registered recovery workflow: ${workflow.name}`);
  }

  /**
   * Execute a recovery workflow
   */
  async executeWorkflow(workflowId: string): Promise<RecoveryExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const execution: RecoveryExecution = {
      workflowId,
      startTime: new Date(),
      status: 'running',
      completedSteps: [],
      failedSteps: [],
    };

    const executionId = `${workflowId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.executions.set(executionId, execution);
    this.metrics.totalExecutions++;

    try {
      this.logger.log(`Starting recovery workflow: ${workflow.name}`);
      this.eventEmitter.emit('recovery.started', { workflowId, executionId });

      // Execute workflow with timeout
      const timeoutMs = workflow.timeoutMs || 300000; // 5 minutes default
      const result = await Promise.race([this.executeSteps(workflow, execution), this.timeout(timeoutMs)]);

      if (result === 'timeout') {
        throw new Error(`Workflow timeout after ${timeoutMs}ms`);
      }

      // Validate recovery if all steps completed
      if (execution.failedSteps.length === 0) {
        execution.status = 'success';
        this.metrics.successfulRecoveries++;
        await workflow.onSuccess?.();
        this.logger.log(`Recovery workflow completed successfully: ${workflow.name}`);
      } else {
        execution.status = 'partial';
        this.metrics.partialRecoveries++;
        this.logger.warn(`Recovery workflow partially completed: ${workflow.name}`);
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = error as Error;
      this.metrics.failedRecoveries++;
      await workflow.onFailure?.(error as Error);
      this.logger.error(`Recovery workflow failed: ${workflow.name}`, error);
    } finally {
      execution.endTime = new Date();
      this.updateMetrics(execution);
      this.eventEmitter.emit('recovery.completed', {
        workflowId,
        executionId,
        status: execution.status,
      });
    }

    return execution;
  }

  private async executeSteps(workflow: RecoveryWorkflow, execution: RecoveryExecution): Promise<void> {
    for (const step of workflow.steps) {
      try {
        this.logger.debug(`Executing recovery step: ${step.name}`);

        // Execute the step action
        await this.retryService.executeWithRetry(() => step.action(), { maxAttempts: workflow.maxRetries || 3 });

        // Validate if provided
        if (step.validation) {
          const isValid = await step.validation();
          if (!isValid) {
            throw new Error(`Validation failed for step: ${step.name}`);
          }
        }

        execution.completedSteps.push(step.name);
        this.logger.debug(`Recovery step completed: ${step.name}`);
      } catch (error) {
        execution.failedSteps.push(step.name);
        this.logger.error(`Recovery step failed: ${step.name}`, error);

        // Try rollback if available
        if (step.rollback) {
          try {
            await step.rollback();
            this.logger.debug(`Rollback completed for step: ${step.name}`);
          } catch (rollbackError) {
            this.logger.error(`Rollback failed for step: ${step.name}`, rollbackError);
          }
        }

        // Stop execution unless configured to continue
        if (!step.continueOnFailure) {
          throw error;
        }
      }
    }
  }

  /**
   * Monitor for error patterns and trigger recovery workflows
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkErrorPatterns();
      this.cleanupOldHistory();
    }, 10000); // Check every 10 seconds
  }

  private checkErrorPatterns(): void {
    for (const [workflowId, workflow] of this.workflows) {
      if (this.shouldTriggerWorkflow(workflow)) {
        this.logger.log(`Auto-triggering recovery workflow: ${workflow.name}`);
        this.executeWorkflow(workflowId).catch((error) => {
          this.logger.error(`Auto-triggered workflow failed: ${workflow.name}`, error);
        });
      }
    }
  }

  private shouldTriggerWorkflow(workflow: RecoveryWorkflow): boolean {
    const trigger = workflow.trigger;
    const timeWindow = trigger.timeWindowMs || 60000; // 1 minute default
    const threshold = trigger.failureThreshold || 5;

    const recentErrors = this.errorHistory.filter((entry) => Date.now() - entry.timestamp.getTime() < timeWindow);

    if (recentErrors.length < threshold) {
      return false;
    }

    // Check error categories
    if (trigger.errorCategories && trigger.errorCategories.length > 0) {
      const matchingErrors = recentErrors.filter((entry) => trigger.errorCategories!.includes(entry.classification.category));
      if (matchingErrors.length >= threshold) {
        return true;
      }
    }

    // Check error severities
    if (trigger.errorSeverities && trigger.errorSeverities.length > 0) {
      const matchingErrors = recentErrors.filter((entry) => trigger.errorSeverities!.includes(entry.classification.severity));
      if (matchingErrors.length >= threshold) {
        return true;
      }
    }

    // Check error patterns
    if (trigger.errorPatterns && trigger.errorPatterns.length > 0) {
      const matchingErrors = recentErrors.filter((entry) => trigger.errorPatterns!.some((pattern) => pattern.test(entry.error.message)));
      if (matchingErrors.length >= threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record an error for monitoring
   */
  recordError(error: Error): void {
    const classification = this.retryService.classifyError(error);
    this.errorHistory.push({
      error,
      timestamp: new Date(),
      classification,
    });

    // Update error pattern metrics
    const pattern = this.getErrorPattern(error);
    const count = this.metrics.errorPatterns.get(pattern) || 0;
    this.metrics.errorPatterns.set(pattern, count + 1);
  }

  private getErrorPattern(error: Error): string {
    // Simple pattern extraction - can be enhanced
    if (error.message.includes('timeout')) {
      return 'timeout';
    }
    if (error.message.includes('rate limit')) {
      return 'rate_limit';
    }
    if (error.message.includes('network')) {
      return 'network';
    }
    if (error.message.includes('authentication')) {
      return 'auth';
    }
    if (error.message.includes('resource')) {
      return 'resource';
    }
    return 'unknown';
  }

  private cleanupOldHistory(): void {
    const oneHourAgo = Date.now() - 3600000;
    this.errorHistory.splice(
      0,
      this.errorHistory.findIndex((entry) => entry.timestamp.getTime() > oneHourAgo),
    );
  }

  private updateMetrics(execution: RecoveryExecution): void {
    if (execution.endTime && execution.startTime) {
      const duration = execution.endTime.getTime() - execution.startTime.getTime();
      // Count successful recoveries for average calculation
      const successCount = this.metrics.successfulRecoveries + (execution.status === 'success' ? 1 : 0);
      if (successCount > 0) {
        const totalTime = this.metrics.averageRecoveryTime * Math.max(0, successCount - 1) + duration;
        this.metrics.averageRecoveryTime = totalTime / successCount;
      }
    }

    const workflowCount = this.metrics.recoveryByWorkflow.get(execution.workflowId) || 0;
    this.metrics.recoveryByWorkflow.set(execution.workflowId, workflowCount + 1);
  }

  private timeout(ms: number): Promise<string> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), ms);
      timer.unref(); // Allow process to exit if this is the only timer
    });
  }

  /**
   * Register default recovery workflows
   */
  private registerDefaultWorkflows(): void {
    // Database connection recovery
    this.registerWorkflow({
      id: 'db-recovery',
      name: 'Database Connection Recovery',
      description: 'Recover from database connection failures',
      trigger: {
        errorCategories: [ErrorCategory.RESOURCE],
        errorPatterns: [/database|connection|ECONNREFUSED/i],
        failureThreshold: 3,
        timeWindowMs: 30000,
      },
      steps: [
        {
          name: 'Reset Connection Pool',
          description: 'Clear and reset database connection pool',
          action: async () => {
            this.logger.log('Resetting database connection pool');
            // Implementation would reset actual connection pool
          },
          validation: async () => {
            // Validate connection is working
            return true;
          },
        },
        {
          name: 'Verify Connectivity',
          description: 'Test database connectivity',
          action: async () => {
            this.logger.log('Testing database connectivity');
            // Implementation would test actual connection
          },
        },
      ],
    });

    // Circuit breaker recovery
    this.registerWorkflow({
      id: 'circuit-breaker-recovery',
      name: 'Circuit Breaker Recovery',
      description: 'Reset circuit breakers after recovery',
      trigger: {
        errorCategories: [ErrorCategory.EXTERNAL, ErrorCategory.TIMEOUT],
        failureThreshold: 5,
        timeWindowMs: 60000,
      },
      steps: [
        {
          name: 'Check Service Health',
          description: 'Verify external services are healthy',
          action: async () => {
            const health = this.fallbackChainService.getServiceHealth();
            this.logger.log(`Service health: ${JSON.stringify(Array.from(health))}`);
          },
        },
        {
          name: 'Reset Circuit Breakers',
          description: 'Reset all open circuit breakers',
          action: async () => {
            this.circuitBreakerService.resetAll();
            this.logger.log('All circuit breakers reset');
          },
        },
      ],
    });

    // Memory cleanup recovery
    this.registerWorkflow({
      id: 'memory-recovery',
      name: 'Memory Recovery',
      description: 'Free up memory when running low',
      trigger: {
        errorPatterns: [/memory|heap|allocation/i],
        failureThreshold: 2,
        timeWindowMs: 30000,
      },
      steps: [
        {
          name: 'Clear Caches',
          description: 'Clear application caches',
          action: async () => {
            this.logger.log('Clearing application caches');
            // Implementation would clear actual caches
          },
        },
        {
          name: 'Force Garbage Collection',
          description: 'Trigger garbage collection',
          action: async () => {
            if (global.gc) {
              global.gc();
              this.logger.log('Garbage collection triggered');
            }
          },
          continueOnFailure: true,
        },
      ],
    });
  }

  /**
   * Get recovery metrics
   */
  getMetrics(): RecoveryMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): RecoveryExecution[] {
    return Array.from(this.executions.values()).filter((exec) => exec.status === 'running');
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 10): RecoveryExecution[] {
    return Array.from(this.executions.values())
      .sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0))
      .slice(0, limit);
  }

  /**
   * Clean up on module destroy
   */
  onModuleDestroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}
