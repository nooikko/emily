export interface QueueConfiguration {
  name: string;
  priority: number;
  durability: boolean;
  deadLetterExchange?: string;
  deadLetterRoutingKey?: string;
  messageTTL?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface MessageMetadata {
  id: string;
  correlationId?: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  priority: TaskPriority;
  originalRoutingKey?: string;
}

export interface TaskMessage<T = any> {
  id: string;
  payload: T;
  metadata: MessageMetadata;
  enqueuedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export enum TaskPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export interface QueueHealthStats {
  queueName: string;
  messageCount: number;
  consumerCount: number;
  avgWaitTime: number;
  throughputPerSecond: number;
  errorRate: number;
  lastProcessedAt: Date;
}

export interface ConnectionPoolConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  vhost?: string;
  maxConnections: number;
  reconnectDelay: number;
  heartbeat: number;
}

export interface DeadLetterMessage extends TaskMessage {
  originalQueue: string;
  failureReason: string;
  failedAt: Date;
  originalError: Error;
}
