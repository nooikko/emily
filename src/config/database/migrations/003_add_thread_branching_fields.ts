import { type MigrationInterface, type QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddThreadBranchingFields1704067200003 implements MigrationInterface {
  name = 'AddThreadBranchingFields1704067200003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add parent thread relationship fields
    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'parentThreadId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'branchType',
        type: 'enum',
        enum: ['root', 'branch', 'merged'],
        default: "'root'",
      }),
    );

    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'branchPointMessageId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'branchMetadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'mergeMetadata',
        type: 'jsonb',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'conversation_threads',
      new TableColumn({
        name: 'isMainBranch',
        type: 'boolean',
        default: true,
      }),
    );

    // Create indexes for efficient branch queries
    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_parentThreadId',
        columnNames: ['parentThreadId'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_branchType',
        columnNames: ['branchType'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_branchPointMessageId',
        columnNames: ['branchPointMessageId'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_threads',
      new TableIndex({
        name: 'IDX_conversation_threads_isMainBranch',
        columnNames: ['isMainBranch'],
      }),
    );

    // Create foreign key relationships
    await queryRunner.createForeignKey(
      'conversation_threads',
      new TableForeignKey({
        columnNames: ['parentThreadId'],
        referencedTableName: 'conversation_threads',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'conversation_threads',
      new TableForeignKey({
        columnNames: ['branchPointMessageId'],
        referencedTableName: 'thread_messages',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const table = await queryRunner.getTable('conversation_threads');

    const parentThreadForeignKey = table?.foreignKeys.find((fk) => fk.columnNames.indexOf('parentThreadId') !== -1);
    if (parentThreadForeignKey) {
      await queryRunner.dropForeignKey('conversation_threads', parentThreadForeignKey);
    }

    const branchPointForeignKey = table?.foreignKeys.find((fk) => fk.columnNames.indexOf('branchPointMessageId') !== -1);
    if (branchPointForeignKey) {
      await queryRunner.dropForeignKey('conversation_threads', branchPointForeignKey);
    }

    // Drop indexes
    await queryRunner.dropIndex('conversation_threads', 'IDX_conversation_threads_parentThreadId');
    await queryRunner.dropIndex('conversation_threads', 'IDX_conversation_threads_branchType');
    await queryRunner.dropIndex('conversation_threads', 'IDX_conversation_threads_branchPointMessageId');
    await queryRunner.dropIndex('conversation_threads', 'IDX_conversation_threads_isMainBranch');

    // Drop columns
    await queryRunner.dropColumn('conversation_threads', 'parentThreadId');
    await queryRunner.dropColumn('conversation_threads', 'branchType');
    await queryRunner.dropColumn('conversation_threads', 'branchPointMessageId');
    await queryRunner.dropColumn('conversation_threads', 'branchMetadata');
    await queryRunner.dropColumn('conversation_threads', 'mergeMetadata');
    await queryRunner.dropColumn('conversation_threads', 'isMainBranch');
  }
}
