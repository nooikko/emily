import { type MigrationInterface, type QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateThreadsTables1704067200002 implements MigrationInterface {
  name = 'CreateThreadsTables1704067200002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create thread_categories table
    await queryRunner.createTable(
      new Table({
        name: 'thread_categories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'color',
            type: 'varchar',
            length: '7',
            isNullable: true,
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'sortOrder',
            type: 'int',
            default: 0,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'isSystem',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'threadCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'settings',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create conversation_threads table
    await queryRunner.createTable(
      new Table({
        name: 'conversation_threads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'archived', 'deleted', 'paused'],
            default: "'active'",
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'normal', 'high', 'urgent'],
            default: "'normal'",
          },
          {
            name: 'categoryId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            default: 'ARRAY[]::text[]',
          },
          {
            name: 'messageCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'unreadCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastActivityAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'lastMessagePreview',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'lastMessageSender',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create thread_messages table
    await queryRunner.createTable(
      new Table({
        name: 'thread_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'threadId',
            type: 'uuid',
          },
          {
            name: 'sender',
            type: 'enum',
            enum: ['human', 'assistant', 'system'],
          },
          {
            name: 'contentType',
            type: 'enum',
            enum: ['text', 'image', 'file', 'audio', 'video', 'mixed'],
            default: "'text'",
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'rawContent',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'parentMessageId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'sequenceNumber',
            type: 'int',
            default: 0,
          },
          {
            name: 'tokenCount',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'processingTimeMs',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'temperature',
            type: 'decimal',
            precision: 3,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'isEdited',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for thread_categories
    await queryRunner.createIndex(
      'thread_categories',
      new TableIndex({
        name: 'IDX_thread_categories_name',
        columnNames: ['name'],
      }),
    );

    await queryRunner.createIndex(
      'thread_categories',
      new TableIndex({
        name: 'IDX_thread_categories_isActive',
        columnNames: ['isActive'],
      }),
    );

    await queryRunner.createIndex(
      'thread_categories',
      new TableIndex({
        name: 'IDX_thread_categories_sortOrder',
        columnNames: ['sortOrder'],
      }),
    );

    // Create indexes for conversation_threads
    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_createdAt',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_lastActivityAt',
        columnNames: ['lastActivityAt'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_categoryId',
        columnNames: ['categoryId'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_userId',
        columnNames: ['userId'],
      }),
    );

    // Create GIN index for tags array search
    await queryRunner.query('CREATE INDEX "IDX_conversation_threads_tags" ON "conversation_threads" USING GIN ("tags")');

    // Create indexes for thread_messages
    await queryRunner.createIndex(
      'thread_messages',
      new TableIndex({
        name: 'IDX_thread_messages_threadId',
        columnNames: ['threadId'],
      }),
    );

    await queryRunner.createIndex(
      'thread_messages',
      new TableIndex({
        name: 'IDX_thread_messages_createdAt',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'thread_messages',
      new TableIndex({
        name: 'IDX_thread_messages_sender',
        columnNames: ['sender'],
      }),
    );

    await queryRunner.createIndex(
      'thread_messages',
      new TableIndex({
        name: 'IDX_thread_messages_contentType',
        columnNames: ['contentType'],
      }),
    );

    // Composite index for efficient thread message queries
    await queryRunner.createIndex(
      'thread_messages',
      new TableIndex({
        name: 'IDX_thread_messages_threadId_createdAt',
        columnNames: ['threadId', 'createdAt'],
      }),
    );

    // Create foreign key relationships
    await queryRunner.createForeignKey(
      'conversation_threads',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedTableName: 'thread_categories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'thread_messages',
      new TableForeignKey({
        columnNames: ['threadId'],
        referencedTableName: 'conversation_threads',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'thread_messages',
      new TableForeignKey({
        columnNames: ['parentMessageId'],
        referencedTableName: 'thread_messages',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // Insert default thread categories
    await this.insertDefaultCategories(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('thread_messages');
    await queryRunner.dropTable('conversation_threads');
    await queryRunner.dropTable('thread_categories');
  }

  /**
   * Insert default thread categories
   */
  private async insertDefaultCategories(queryRunner: QueryRunner): Promise<void> {
    const defaultCategories = [
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

    // Insert categories
    for (const category of defaultCategories) {
      await queryRunner.query(
        `
        INSERT INTO thread_categories (
          name, description, color, icon, "sortOrder", "isSystem", "isActive", "threadCount"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `,
        [
          category.name,
          category.description,
          category.color,
          category.icon,
          category.sortOrder,
          category.isSystem,
          category.isActive,
          0, // threadCount
        ],
      );
    }
  }
}
