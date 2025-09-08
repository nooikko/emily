import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { FallbackChainService } from './services/fallback-chain.service';
import { LangChainErrorHandlerService } from './services/langchain-error-handler.service';
import { RecoveryWorkflowService } from './services/recovery-workflow.service';
import { RetryService } from './services/retry.service';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
  ],
  providers: [RetryService, CircuitBreakerService, FallbackChainService, RecoveryWorkflowService, LangChainErrorHandlerService],
  exports: [RetryService, CircuitBreakerService, FallbackChainService, RecoveryWorkflowService, LangChainErrorHandlerService],
})
export class ErrorHandlingModule {}
