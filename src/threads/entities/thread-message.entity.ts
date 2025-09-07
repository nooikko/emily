import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ConversationThread } from './conversation-thread.entity';

/**
 * Metadata for individual thread messages with specific typed fields
 */
export interface ThreadMessageMetadata {
  /** User agent string for web requests */
  userAgent?: string;
  /** Client IP address (anonymized) */
  ipAddress?: string;
  /** Session identifier */
  sessionId?: string;
  /** Source of the message (api, web, mobile) */
  source?: string;
  /** Detected language of the content */
  language?: string;
  /** Sentiment analysis result */
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  /** Confidence score for AI responses */
  confidence?: number;
  /** Token usage statistics */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
  /** Model-specific metadata */
  modelMetadata?: {
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
    logprobs?: Record<string, number>;
  };
  /** Custom application metadata */
  custom?: Record<string, string | number | boolean>;
  /** Allow additional unknown fields for backward compatibility */
  [key: string]: unknown;
}

/**
 * Content metadata for multi-modal content
 */
export interface ContentMetadata {
  /** File size in bytes */
  fileSize?: number;
  /** File size (legacy field name for backward compatibility) */
  size?: number;
  /** MIME type */
  mimeType?: string;
  /** File name */
  fileName?: string;
  /** Image dimensions */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Duration for audio/video */
  duration?: number;
  /** Custom content metadata */
  custom?: Record<string, string | number | boolean>;
  /** Allow additional unknown fields for flexibility */
  [key: string]: unknown;
}

/**
 * Message sender types
 */
export enum MessageSender {
  /** Human user message */
  HUMAN = 'human',
  /** AI assistant response */
  ASSISTANT = 'assistant',
  /** System-generated message */
  SYSTEM = 'system',
}

/**
 * Message content types for multi-modal support
 */
export enum MessageContentType {
  /** Plain text content */
  TEXT = 'text',
  /** Image content with URL */
  IMAGE = 'image',
  /** File attachment */
  FILE = 'file',
  /** Audio content */
  AUDIO = 'audio',
  /** Video content */
  VIDEO = 'video',
  /** Mixed content (multiple types) */
  MIXED = 'mixed',
}

/**
 * ThreadMessage Entity
 *
 * Represents individual messages within conversation threads.
 * Stores message content, metadata, and relationships to threads.
 *
 * This entity enables detailed message history, content analysis,
 * and supports multi-modal content types.
 */
@Entity('thread_messages')
@Index(['threadId'])
@Index(['createdAt'])
@Index(['sender'])
@Index(['contentType'])
@Index(['threadId', 'createdAt'])
export class ThreadMessage {
  @ApiProperty({
    description: 'Unique identifier for the message',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Thread ID that this message belongs to',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @Column({ type: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  threadId!: string;

  @ApiProperty({
    description: 'Message sender type',
    enum: MessageSender,
    example: MessageSender.HUMAN,
  })
  @Column({ type: 'enum', enum: MessageSender })
  @IsEnum(MessageSender)
  sender!: MessageSender;

  @ApiProperty({
    description: 'Type of content in the message',
    enum: MessageContentType,
    example: MessageContentType.TEXT,
    default: MessageContentType.TEXT,
  })
  @Column({ type: 'enum', enum: MessageContentType, default: MessageContentType.TEXT })
  @IsEnum(MessageContentType)
  contentType!: MessageContentType;

  @ApiProperty({
    description: 'Main message content as text',
    example: 'Hello, how can I help you with TypeScript today?',
  })
  @Column({ type: 'text' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({
    description: 'Raw content structure for multi-modal messages',
    type: 'array',
    items: {
      oneOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['text'] },
            text: { type: 'string' },
          },
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['image_url'] },
            imageUrl: { type: 'string', format: 'uri' },
            detail: { type: 'string', enum: ['auto', 'low', 'high'] },
          },
        },
      ],
    },
    example: [
      { type: 'text', text: 'Hello, how can I help you today?' },
      { type: 'image_url', imageUrl: 'https://example.com/image.jpg', detail: 'auto' },
    ],
  })
  @Column({ type: 'jsonb', nullable: true })
  rawContent?: Array<{
    type: 'text' | 'image_url' | 'file' | 'audio' | 'video';
    text?: string;
    imageUrl?: string;
    fileUrl?: string;
    audioUrl?: string;
    videoUrl?: string;
    detail?: 'auto' | 'low' | 'high';
    metadata?: ContentMetadata;
  }>;

  @ApiPropertyOptional({
    description: 'Message role in conversation context',
    example: 'assistant',
    maxLength: 50,
  })
  @Column({ type: 'varchar', length: 50, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  role?: string;

  @ApiPropertyOptional({
    description: 'Parent message ID for threaded conversations',
    example: '789e1234-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @Column({ type: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  parentMessageId?: string;

  @ApiPropertyOptional({
    description: 'Sequence number within the thread for ordering',
    example: 5,
    minimum: 0,
  })
  @Column({ type: 'int', default: 0 })
  sequenceNumber!: number;

  @ApiPropertyOptional({
    description: 'Token count for the message content',
    example: 150,
    minimum: 0,
  })
  @Column({ type: 'int', nullable: true })
  tokenCount?: number;

  @ApiPropertyOptional({
    description: 'Processing time in milliseconds for AI responses',
    example: 1250,
    minimum: 0,
  })
  @Column({ type: 'int', nullable: true })
  processingTimeMs?: number;

  @ApiPropertyOptional({
    description: 'AI model used to generate this message (for assistant messages)',
    example: 'claude-3-sonnet-20240229',
    maxLength: 100,
  })
  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({
    description: 'Model temperature used for generation',
    example: 0.7,
    minimum: 0,
    maximum: 2,
  })
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Whether this message was edited',
    example: false,
    default: false,
  })
  @Column({ type: 'boolean', default: false })
  isEdited!: boolean;

  @ApiPropertyOptional({
    description: 'Whether this message is marked as deleted',
    example: false,
    default: false,
  })
  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;

  @ApiPropertyOptional({
    description: 'Additional message metadata',
    type: 'object',
    properties: {
      userAgent: { type: 'string', description: 'User agent string for web requests' },
      ipAddress: { type: 'string', description: 'Client IP address (anonymized)' },
      sessionId: { type: 'string', description: 'Session identifier' },
      source: { type: 'string', description: 'Source of the message (api, web, mobile)' },
      language: { type: 'string', description: 'Detected language of the content' },
      sentiment: { type: 'string', description: 'Sentiment analysis result' },
      confidence: { type: 'number', description: 'Confidence score for AI responses' },
      usage: { type: 'object', additionalProperties: true, description: 'Token usage statistics' },
    },
  })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: ThreadMessageMetadata;

  @ApiProperty({
    description: 'Message creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Message last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships

  @ApiPropertyOptional({
    description: 'Thread that this message belongs to',
    type: () => ConversationThread,
  })
  @ManyToOne(
    () => ConversationThread,
    (thread) => thread.messages,
    {
      onDelete: 'CASCADE',
      lazy: true,
    },
  )
  @JoinColumn({ name: 'threadId' })
  thread?: Promise<ConversationThread>;

  /**
   * Mark message as edited
   */
  markAsEdited(): void {
    this.isEdited = true;
  }

  /**
   * Mark message as deleted (soft delete)
   */
  markAsDeleted(): void {
    this.isDeleted = true;
  }

  /**
   * Restore deleted message
   */
  restore(): void {
    this.isDeleted = false;
  }

  /**
   * Check if message is from human
   */
  isHuman(): boolean {
    return this.sender === MessageSender.HUMAN;
  }

  /**
   * Check if message is from assistant
   */
  isAssistant(): boolean {
    return this.sender === MessageSender.ASSISTANT;
  }

  /**
   * Check if message is system message
   */
  isSystem(): boolean {
    return this.sender === MessageSender.SYSTEM;
  }

  /**
   * Get content preview for display purposes
   */
  getContentPreview(maxLength = 100): string {
    if (this.content.length <= maxLength) {
      return this.content;
    }
    if (maxLength <= 3) {
      return '';
    }
    return `${this.content.substring(0, maxLength - 3)}...`;
  }

  /**
   * Update token count based on content
   */
  estimateTokenCount(): void {
    // Simple token estimation (roughly 4 characters per token for English)
    if (this.content === null || this.content === undefined) {
      throw new Error('Content is required for token estimation');
    }
    this.tokenCount = Math.ceil(this.content.length / 4);
  }

  /**
   * Create a sanitized version for API responses
   */
  toSafeObject() {
    return {
      id: this.id,
      threadId: this.threadId,
      sender: this.sender,
      contentType: this.contentType,
      content: this.content,
      rawContent: this.rawContent,
      role: this.role,
      parentMessageId: this.parentMessageId,
      sequenceNumber: this.sequenceNumber,
      tokenCount: this.tokenCount,
      processingTimeMs: this.processingTimeMs,
      model: this.model,
      temperature: this.temperature,
      isEdited: this.isEdited,
      isDeleted: this.isDeleted,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
