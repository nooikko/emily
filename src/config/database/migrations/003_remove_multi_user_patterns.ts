import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class RemoveMultiUserPatterns1704067200003 implements MigrationInterface {
  name = 'RemoveMultiUserPatterns1704067200003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop user-related indexes first (before dropping columns)
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_conversation_threads_userId"');

    // Drop user-related columns from conversation_threads table
    await queryRunner.query('ALTER TABLE "conversation_threads" DROP COLUMN IF EXISTS "userId"');

    // Drop user-related columns from thread_categories table
    await queryRunner.query('ALTER TABLE "thread_categories" DROP COLUMN IF EXISTS "createdBy"');

    // Note: Configuration entity updatedBy field is handled at the application level
    // and doesn't require database migration since it's not a database column
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore user-related columns to conversation_threads table
    await queryRunner.query(`
      ALTER TABLE "conversation_threads" 
      ADD COLUMN "userId" varchar(255) NULL
    `);

    // Restore user-related columns to thread_categories table
    await queryRunner.query(`
      ALTER TABLE "thread_categories" 
      ADD COLUMN "createdBy" varchar(255) NULL
    `);

    // Recreate user-related indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_threads_userId" 
      ON "conversation_threads" ("userId")
    `);
  }
}
