import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ThreadMetadata } from '../dto/create-thread.dto';
import { ThreadCategory } from './thread-category.entity';
import { ThreadMessage } from './thread-message.entity';

/**
 * Thread status enumeration for lifecycle management
 */
export enum ThreadStatus {
  /** Thread is active and can receive new messages */
  ACTIVE = 'active',
  /** Thread is archived but still accessible for reading */
  ARCHIVED = 'archived',
  /** Thread is deleted and hidden from normal operations */
  DELETED = 'deleted',
  /** Thread is temporarily paused */
  PAUSED = 'paused',
}

/**
 * Thread priority levels for organizing and filtering
 */
export enum ThreadPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * ConversationThread Entity
 *
 * Represents a conversation thread that groups related messages together.
 * Maintains metadata about the conversation including title, summary, and status.
 *
 * This entity serves as the central organizing principle for conversations,
 * building upon the existing threadId concept already used throughout the system.
 */
@Entity('conversation_threads')
@Index(['status'])
@Index(['createdAt'])
@Index(['lastActivityAt'])
export class ConversationThread {
  @ApiProperty({
    description: 'Unique identifier for the conversation thread',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Human-readable title for the thread, auto-generated or user-provided',
    example: 'Discussion about TypeScript best practices',
    maxLength: 255,
  })
  @Column({ type: 'varchar', length: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    description: 'Brief summary of the thread content and key topics discussed',
    example: 'User asked about advanced TypeScript features including conditional types and utility types. Provided examples and best practices.',
    maxLength: 1000,
  })
  @Column({ type: 'text', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  summary?: string;

  @ApiProperty({
    description: 'Current status of the thread',
    enum: ThreadStatus,
    example: ThreadStatus.ACTIVE,
    default: ThreadStatus.ACTIVE,
  })
  @Column({ type: 'enum', enum: ThreadStatus, default: ThreadStatus.ACTIVE })
  @IsEnum(ThreadStatus)
  status!: ThreadStatus;

  @ApiProperty({
    description: 'Priority level of the thread for organization',
    enum: ThreadPriority,
    example: ThreadPriority.NORMAL,
    default: ThreadPriority.NORMAL,
  })
  @Column({ type: 'enum', enum: ThreadPriority, default: ThreadPriority.NORMAL })
  @IsEnum(ThreadPriority)
  priority!: ThreadPriority;

  @ApiPropertyOptional({
    description: 'Category identifier from thread-category entity',
    example: '456e7890-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @Column({ type: 'uuid', nullable: true })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Thread category relationship',
    type: () => ThreadCategory,
  })
  @ManyToOne(() => ThreadCategory, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: ThreadCategory;

  @ApiPropertyOptional({
    description: 'Optional tags for categorization and search',
    example: ['typescript', 'best-practices', 'development'],
    type: [String],
  })
  @Column({ type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  tags!: string[];

  @ApiPropertyOptional({
    description: 'Number of messages in this thread',
    example: 12,
    minimum: 0,
  })
  @Column({ type: 'int', default: 0 })
  messageCount!: number;

  @ApiPropertyOptional({
    description: 'Number of unread messages (user-specific)',
    example: 3,
    minimum: 0,
  })
  @Column({ type: 'int', default: 0 })
  unreadCount!: number;

  @ApiPropertyOptional({
    description: 'Timestamp of the last activity in this thread',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt?: Date;

  @ApiPropertyOptional({
    description: 'Content of the last message for preview purposes',
    example: "That's a great question about TypeScript utility types...",
    maxLength: 500,
  })
  @Column({ type: 'varchar', length: 500, nullable: true })
  @MaxLength(500)
  lastMessagePreview?: string;

  @ApiPropertyOptional({
    description: 'Type of the last message sender',
    enum: ['human', 'assistant', 'system'],
    example: 'assistant',
  })
  @Column({ type: 'varchar', length: 20, nullable: true })
  lastMessageSender?: 'human' | 'assistant' | 'system';

  @ApiPropertyOptional({
    description: 'Additional metadata stored as JSON',
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source of the conversation (api, web, mobile)' },
      language: { type: 'string', description: 'Primary language of the conversation' },
      model: { type: 'string', description: 'AI model used for responses' },
      context: { type: 'object', additionalProperties: true, description: 'Additional context information' },
    },
  })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: ThreadMetadata;

  @ApiProperty({
    description: 'Thread creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Thread last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @UpdateDateColumn()
  updatedAt!: Date;

  // Relationships

  @ApiPropertyOptional({
    description: 'Messages belonging to this thread',
    type: () => [ThreadMessage],
  })
  @OneToMany(
    () => ThreadMessage,
    (message) => message.thread,
    {
      cascade: true,
      lazy: true,
    },
  )
  messages?: Promise<ThreadMessage[]>;

  /**
   * Update the thread's activity timestamp and message preview
   */
  updateLastActivity(messagePreview?: string, sender?: 'human' | 'assistant' | 'system'): void {
    this.lastActivityAt = new Date();
    if (messagePreview) {
      this.lastMessagePreview = messagePreview.length > 500 ? `${messagePreview.substring(0, 497)}...` : messagePreview;
    }
    if (sender) {
      this.lastMessageSender = sender;
    }
  }

  /**
   * Increment the message count
   */
  incrementMessageCount(): void {
    this.messageCount += 1;
  }

  /**
   * Decrement the message count (when messages are deleted)
   */
  decrementMessageCount(): void {
    if (this.messageCount > 0) {
      this.messageCount -= 1;
    }
  }

  /**
   * Mark thread as archived
   */
  archive(): void {
    this.status = ThreadStatus.ARCHIVED;
  }

  /**
   * Mark thread as deleted
   */
  delete(): void {
    this.status = ThreadStatus.DELETED;
  }

  /**
   * Restore thread to active status
   */
  restore(): void {
    this.status = ThreadStatus.ACTIVE;
  }

  /**
   * Check if thread is active
   */
  isActive(): boolean {
    return this.status === ThreadStatus.ACTIVE;
  }

  /**
   * Check if thread is archived
   */
  isArchived(): boolean {
    return this.status === ThreadStatus.ARCHIVED;
  }

  /**
   * Check if thread is deleted
   */
  isDeleted(): boolean {
    return this.status === ThreadStatus.DELETED;
  }

  /**
   * Generate auto-title from first message or content
   */
  generateTitle(content: string): void {
    if (!this.title || this.title === 'New Conversation') {
      // Extract first meaningful sentence or truncate content
      if (content === null || content === undefined) {
        this.title = 'New Conversation';
        return;
      }
      if (content === '') {
        this.title = '';
        return;
      }
      const cleanContent = content.trim().replace(/\s+/g, ' ');

      // Always try to extract first sentence first
      const firstSentence = cleanContent.split(/[.!?]/)[0];
      if (firstSentence && firstSentence.trim().length > 0 && firstSentence.trim().length <= 50) {
        this.title = firstSentence.trim();
      } else if (cleanContent.length <= 50) {
        this.title = cleanContent;
      } else {
        this.title = `${cleanContent.substring(0, 47)}...`;
      }
    }
  }

  /**
   * Create a sanitized version for API responses
   */
  toSafeObject() {
    return {
      id: this.id,
      title: this.title,
      summary: this.summary,
      status: this.status,
      priority: this.priority,
      categoryId: this.categoryId,
      tags: this.tags,
      messageCount: this.messageCount,
      unreadCount: this.unreadCount,
      lastActivityAt: this.lastActivityAt,
      lastMessagePreview: this.lastMessagePreview,
      lastMessageSender: this.lastMessageSender,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
