import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueueHealthStats, TaskPriority } from '../interfaces/queue.interface';
import { QueueManagerService } from './queue-manager.service';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';

export interface HealthAlert {
  type: 'HIGH_QUEUE_DEPTH' | 'LOW_THROUGHPUT' | 'HIGH_ERROR_RATE' | 'CONSUMER_DOWN' | 'CONNECTION_LOST';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  queueName?: string;
  message: string;
  timestamp: Date;
  metrics?: Record<string, any>;
}

@Injectable()
export class QueueHealthMonitorService {
  private readonly logger = new Logger(QueueHealthMonitorService.name);
  private readonly healthThresholds = {
    maxQueueDepth: {
      [TaskPriority.CRITICAL]: 10,
      [TaskPriority.HIGH]: 50,
      [TaskPriority.NORMAL]: 100,
      [TaskPriority.LOW]: 200,
    },
    minThroughputPerSecond: {
      [TaskPriority.CRITICAL]: 5,
      [TaskPriority.HIGH]: 2,
      [TaskPriority.NORMAL]: 1,
      [TaskPriority.LOW]: 0.5,
    },
    maxErrorRate: 0.05, // 5%
    maxAvgWaitTime: {
      [TaskPriority.CRITICAL]: 30000, // 30 seconds
      [TaskPriority.HIGH]: 120000, // 2 minutes
      [TaskPriority.NORMAL]: 300000, // 5 minutes
      [TaskPriority.LOW]: 900000, // 15 minutes
    },
  };

  private healthHistory = new Map<string, QueueHealthStats[]>();
  private alertHistory = new Set<string>();
  private readonly maxHistorySize = 100;

  constructor(
    private readonly connectionService: RabbitMQConnectionService,
    private readonly queueManager: QueueManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async performHealthCheck(): Promise<void> {
    try {
      await this.checkConnectionHealth();
      await this.checkQueueHealth();
      await this.checkSystemHealth();
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async generateHealthReport(): Promise<void> {
    try {
      const report = await this.generateDetailedHealthReport();
      this.logger.log('Health Report', report);

      this.eventEmitter.emit('health.report.generated', report);
    } catch (error) {
      this.logger.error(`Failed to generate health report: ${error.message}`);
    }
  }

  private async checkConnectionHealth(): Promise<void> {
    if (!this.connectionService.isConnected()) {
      await this.raiseAlert({
        type: 'CONNECTION_LOST',
        severity: 'CRITICAL',
        message: 'RabbitMQ connection lost',
        timestamp: new Date(),
        metrics: {
          connectionStatus: 'disconnected',
        },
      });
      return;
    }

    // Test connection with a ping
    try {
      const channel = await this.connectionService.getChannel('health-check');
      const queueInfo = await channel.checkQueue('langchain.health');
      await channel.sendToQueue(
        'langchain.health',
        Buffer.from(
          JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString(),
          }),
        ),
      );

      this.logger.debug('Connection health check passed');
    } catch (error) {
      await this.raiseAlert({
        type: 'CONNECTION_LOST',
        severity: 'HIGH',
        message: `Connection health check failed: ${error.message}`,
        timestamp: new Date(),
        metrics: {
          error: error.message,
        },
      });
    }
  }

  private async checkQueueHealth(): Promise<void> {
    const healthStats = await this.queueManager.getQueueHealth();

    for (const stats of healthStats) {
      await this.analyzeQueueStats(stats);
      this.updateHealthHistory(stats);
    }

    // Check for missing critical queues
    await this.checkCriticalQueues();
  }

  private async analyzeQueueStats(stats: QueueHealthStats): Promise<void> {
    const priority = this.extractPriorityFromQueueName(stats.queueName);

    // Check queue depth
    if (priority && stats.messageCount > this.healthThresholds.maxQueueDepth[priority]) {
      await this.raiseAlert({
        type: 'HIGH_QUEUE_DEPTH',
        severity: this.getSeverityForPriority(priority),
        queueName: stats.queueName,
        message: `High queue depth: ${stats.messageCount} messages (threshold: ${this.healthThresholds.maxQueueDepth[priority]})`,
        timestamp: new Date(),
        metrics: {
          currentDepth: stats.messageCount,
          threshold: this.healthThresholds.maxQueueDepth[priority],
          priority,
        },
      });
    }

    // Check throughput
    if (priority && stats.throughputPerSecond < this.healthThresholds.minThroughputPerSecond[priority]) {
      await this.raiseAlert({
        type: 'LOW_THROUGHPUT',
        severity: this.getSeverityForPriority(priority),
        queueName: stats.queueName,
        message: `Low throughput: ${stats.throughputPerSecond.toFixed(2)} msg/s (threshold: ${this.healthThresholds.minThroughputPerSecond[priority]})`,
        timestamp: new Date(),
        metrics: {
          currentThroughput: stats.throughputPerSecond,
          threshold: this.healthThresholds.minThroughputPerSecond[priority],
          priority,
        },
      });
    }

    // Check error rate
    if (stats.errorRate > this.healthThresholds.maxErrorRate) {
      await this.raiseAlert({
        type: 'HIGH_ERROR_RATE',
        severity: 'HIGH',
        queueName: stats.queueName,
        message: `High error rate: ${(stats.errorRate * 100).toFixed(2)}% (threshold: ${(this.healthThresholds.maxErrorRate * 100).toFixed(2)}%)`,
        timestamp: new Date(),
        metrics: {
          currentErrorRate: stats.errorRate,
          threshold: this.healthThresholds.maxErrorRate,
        },
      });
    }

    // Check average wait time
    if (priority && stats.avgWaitTime > this.healthThresholds.maxAvgWaitTime[priority]) {
      await this.raiseAlert({
        type: 'HIGH_QUEUE_DEPTH',
        severity: this.getSeverityForPriority(priority),
        queueName: stats.queueName,
        message: `High average wait time: ${stats.avgWaitTime}ms (threshold: ${this.healthThresholds.maxAvgWaitTime[priority]}ms)`,
        timestamp: new Date(),
        metrics: {
          currentWaitTime: stats.avgWaitTime,
          threshold: this.healthThresholds.maxAvgWaitTime[priority],
          priority,
        },
      });
    }

    // Check consumer count
    if (stats.consumerCount === 0) {
      await this.raiseAlert({
        type: 'CONSUMER_DOWN',
        severity: 'CRITICAL',
        queueName: stats.queueName,
        message: `No active consumers for queue ${stats.queueName}`,
        timestamp: new Date(),
        metrics: {
          consumerCount: stats.consumerCount,
        },
      });
    }
  }

  private async checkCriticalQueues(): Promise<void> {
    const criticalQueues = ['langchain.tasks.critical', 'langchain.tasks.high', 'langchain.tasks.normal', 'langchain.tasks.low'];

    for (const queueName of criticalQueues) {
      try {
        await this.connectionService.getQueueInfo(queueName);
      } catch (error) {
        await this.raiseAlert({
          type: 'CONSUMER_DOWN',
          severity: 'HIGH',
          queueName,
          message: `Critical queue ${queueName} is not available: ${error.message}`,
          timestamp: new Date(),
          metrics: {
            error: error.message,
          },
        });
      }
    }
  }

  private async checkSystemHealth(): Promise<void> {
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB

    if (memoryUsage.heapUsed > memoryThreshold) {
      this.logger.warn(`High memory usage detected: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }

    // Check event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert to milliseconds

      if (lag > 100) {
        // 100ms threshold
        this.logger.warn(`High event loop lag detected: ${lag.toFixed(2)}ms`);
      }
    });
  }

  private updateHealthHistory(stats: QueueHealthStats): void {
    const queueName = stats.queueName;

    if (!this.healthHistory.has(queueName)) {
      this.healthHistory.set(queueName, []);
    }

    const history = this.healthHistory.get(queueName)!;
    history.push({
      ...stats,
      // Create a copy with current timestamp
      lastProcessedAt: new Date(),
    });

    // Keep only the last N entries
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  private async raiseAlert(alert: HealthAlert): Promise<void> {
    // Prevent spam - only alert once per hour for the same issue
    const alertKey = `${alert.type}-${alert.queueName || 'global'}-${alert.severity}`;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (this.alertHistory.has(alertKey)) {
      // Check if we should re-alert (after cooldown period)
      const lastAlertTime = Number.parseInt(alertKey.split('-').pop() || '0');
      if (now - lastAlertTime < oneHour) {
        return;
      }
    }

    this.alertHistory.add(`${alertKey}-${now}`);

    // Clean old alerts
    for (const key of this.alertHistory) {
      const alertTime = Number.parseInt(key.split('-').pop() || '0');
      if (now - alertTime > oneHour) {
        this.alertHistory.delete(key);
      }
    }

    this.logger.error(`Health Alert [${alert.severity}]: ${alert.message}`, {
      type: alert.type,
      queueName: alert.queueName,
      metrics: alert.metrics,
    });

    this.eventEmitter.emit('health.alert', alert);
  }

  private async generateDetailedHealthReport(): Promise<any> {
    const allStats = await this.queueManager.getQueueHealth();
    const report = {
      timestamp: new Date(),
      connectionStatus: this.connectionService.isConnected() ? 'connected' : 'disconnected',
      queues: allStats.map((stats) => ({
        ...stats,
        health: this.calculateQueueHealthScore(stats),
        trend: this.calculateHealthTrend(stats.queueName),
      })),
      systemMetrics: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        version: process.version,
      },
      alerts: {
        total: this.alertHistory.size,
        recent: Array.from(this.alertHistory).slice(-10),
      },
    };

    return report;
  }

  private calculateQueueHealthScore(stats: QueueHealthStats): number {
    let score = 100;
    const priority = this.extractPriorityFromQueueName(stats.queueName);

    if (!priority) return score;

    // Deduct points for various issues
    if (stats.messageCount > this.healthThresholds.maxQueueDepth[priority]) {
      score -= 30;
    }

    if (stats.throughputPerSecond < this.healthThresholds.minThroughputPerSecond[priority]) {
      score -= 25;
    }

    if (stats.errorRate > this.healthThresholds.maxErrorRate) {
      score -= 25;
    }

    if (stats.consumerCount === 0) {
      score -= 50;
    }

    if (stats.avgWaitTime > this.healthThresholds.maxAvgWaitTime[priority]) {
      score -= 20;
    }

    return Math.max(0, score);
  }

  private calculateHealthTrend(queueName: string): 'improving' | 'degrading' | 'stable' {
    const history = this.healthHistory.get(queueName);
    if (!history || history.length < 3) {
      return 'stable';
    }

    const recent = history.slice(-3);
    const scores = recent.map((stats) => this.calculateQueueHealthScore(stats));

    const trend = scores[2] - scores[0];

    if (trend > 10) return 'improving';
    if (trend < -10) return 'degrading';
    return 'stable';
  }

  private extractPriorityFromQueueName(queueName: string): TaskPriority | null {
    for (const priority of Object.values(TaskPriority)) {
      if (queueName.includes(priority)) {
        return priority;
      }
    }
    return null;
  }

  private getSeverityForPriority(priority: TaskPriority): HealthAlert['severity'] {
    const severityMap = {
      [TaskPriority.CRITICAL]: 'CRITICAL' as const,
      [TaskPriority.HIGH]: 'HIGH' as const,
      [TaskPriority.NORMAL]: 'MEDIUM' as const,
      [TaskPriority.LOW]: 'LOW' as const,
    };

    return severityMap[priority];
  }

  async getHealthHistory(queueName: string, limit = 50): Promise<QueueHealthStats[]> {
    const history = this.healthHistory.get(queueName);
    if (!history) return [];

    return history.slice(-limit);
  }

  async getCurrentHealthStatus(): Promise<{ healthy: boolean; issues: string[] }> {
    const allStats = await this.queueManager.getQueueHealth();
    const issues: string[] = [];

    if (!this.connectionService.isConnected()) {
      issues.push('RabbitMQ connection lost');
    }

    for (const stats of allStats) {
      const score = this.calculateQueueHealthScore(stats);
      if (score < 80) {
        issues.push(`Queue ${stats.queueName} health score: ${score}/100`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}
