import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigurationEntity } from '../config/entities/configuration.entity';
import { ConversationThread } from '../threads/entities/conversation-thread.entity';
import { ThreadCategory } from '../threads/entities/thread-category.entity';
import { ThreadMessage } from '../threads/entities/thread-message.entity';

/**
 * Test TypeORM configuration for in-memory SQLite database
 * This provides a lightweight, isolated database for each test run
 */
export const getTestTypeOrmModule = () =>
  TypeOrmModule.forRoot({
    type: 'sqlite',
    database: ':memory:',
    entities: [ConversationThread, ThreadMessage, ThreadCategory, ConfigurationEntity],
    synchronize: true,
    dropSchema: true,
    logging: false, // Suppress SQL logs during tests
  });

/**
 * Get TypeORM feature modules for specific entities
 * Use this when you need to test services that depend on specific repositories
 */
export const getTestTypeOrmFeatureModule = (entities: any[]) => TypeOrmModule.forFeature(entities);

/**
 * Mock providers for common TypeORM dependencies
 * Use these when you want to mock repository behavior completely
 */
export const getMockTypeOrmProviders = () => [
  {
    provide: 'ConversationThreadRepository',
    useValue: {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
  {
    provide: 'ThreadMessageRepository',
    useValue: {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
  {
    provide: 'ThreadCategoryRepository',
    useValue: {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
];
