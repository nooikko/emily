import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * ThreadCategory Entity
 *
 * Represents categories for organizing conversation threads.
 * Provides a way to group related threads and apply consistent styling/behavior.
 *
 * This entity enables users to organize their conversations into logical
 * groups such as "Work", "Personal", "Learning", "Projects", etc.
 */
@Entity('thread_categories')
@Index(['name'])
@Index(['isActive'])
@Index(['sortOrder'])
export class ThreadCategory {
  @ApiProperty({
    description: 'Unique identifier for the category',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Work Projects',
    maxLength: 100,
  })
  @Column({ type: 'varchar', length: 100, unique: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Conversations related to work projects and professional tasks',
    maxLength: 500,
  })
  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category color as hex code for UI display',
    example: '#3B82F6',
    pattern: '^#[0-9A-Fa-f]{6}$',
  })
  @Column({ type: 'varchar', length: 7, nullable: true })
  @IsHexColor()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Icon name or identifier for the category',
    example: 'briefcase',
    maxLength: 50,
  })
  @Column({ type: 'varchar', length: 50, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Sort order for category display',
    example: 1,
    minimum: 0,
  })
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @ApiProperty({
    description: 'Whether the category is active',
    example: true,
    default: true,
  })
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: 'Whether this is a system-defined category',
    example: false,
    default: false,
  })
  @Column({ type: 'boolean', default: false })
  isSystem!: boolean;

  @ApiPropertyOptional({
    description: 'User ID who created this category (null for system categories)',
    example: 'user-789e1234-e89b-12d3-a456-426614174000',
    maxLength: 255,
  })
  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Number of threads in this category',
    example: 5,
    minimum: 0,
  })
  @Column({ type: 'int', default: 0 })
  threadCount!: number;

  @ApiPropertyOptional({
    description: 'Category-specific settings and preferences',
    type: 'object',
    properties: {
      autoArchiveAfterDays: { type: 'number', description: 'Auto-archive threads after N days of inactivity' },
      defaultPriority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Default priority for new threads' },
      notificationsEnabled: { type: 'boolean', description: 'Whether to send notifications for this category' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Default tags to apply to threads' },
    },
  })
  @Column({ type: 'jsonb', nullable: true })
  settings?: {
    autoArchiveAfterDays?: number;
    defaultPriority?: 'low' | 'normal' | 'high' | 'urgent';
    notificationsEnabled?: boolean;
    tags?: string[];
    [key: string]: unknown;
  };

  @ApiProperty({
    description: 'Category creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Category last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Increment thread count when a thread is added to this category
   */
  incrementThreadCount(): void {
    this.threadCount += 1;
  }

  /**
   * Decrement thread count when a thread is removed from this category
   */
  decrementThreadCount(): void {
    if (this.threadCount > 0) {
      this.threadCount -= 1;
    }
  }

  /**
   * Deactivate the category
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * Activate the category
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * Check if category is system-defined
   */
  isSystemCategory(): boolean {
    return this.isSystem;
  }

  /**
   * Check if category can be edited by user
   */
  canEdit(userId?: string): boolean {
    if (this.isSystem) {
      return false;
    }
    if (!this.createdBy) {
      return true; // System categories without creator restriction
    }
    return this.createdBy === userId;
  }

  /**
   * Check if category can be deleted by user
   */
  canDelete(userId?: string): boolean {
    if (this.isSystem) {
      return false;
    }
    if (this.threadCount > 0) {
      return false; // Cannot delete categories with threads
    }
    return this.canEdit(userId);
  }

  /**
   * Create a sanitized version for API responses
   */
  toSafeObject() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      color: this.color,
      icon: this.icon,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
      isSystem: this.isSystem,
      createdBy: this.createdBy,
      threadCount: this.threadCount,
      settings: this.settings,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Get default system categories
   */
  static getDefaultCategories(): Partial<ThreadCategory>[] {
    return [
      {
        name: 'General',
        description: 'General conversations and miscellaneous topics',
        color: '#6B7280',
        icon: 'chat',
        sortOrder: 0,
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Work',
        description: 'Work-related conversations and professional topics',
        color: '#3B82F6',
        icon: 'briefcase',
        sortOrder: 1,
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Learning',
        description: 'Educational content and learning discussions',
        color: '#10B981',
        icon: 'academic-cap',
        sortOrder: 2,
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Personal',
        description: 'Personal conversations and private topics',
        color: '#F59E0B',
        icon: 'user',
        sortOrder: 3,
        isSystem: true,
        isActive: true,
      },
      {
        name: 'Projects',
        description: 'Project-specific conversations and development work',
        color: '#8B5CF6',
        icon: 'code',
        sortOrder: 4,
        isSystem: true,
        isActive: true,
      },
    ];
  }
}
