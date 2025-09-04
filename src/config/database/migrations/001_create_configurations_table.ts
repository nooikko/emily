import { type MigrationInterface, type QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateConfigurationsTable1693824000001 implements MigrationInterface {
  name = 'CreateConfigurationsTable1693824000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create configurations table
    await queryRunner.createTable(
      new Table({
        name: 'configurations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'category',
            type: 'enum',
            enum: [
              'feature_flags',
              'service_settings',
              'model_config',
              'performance',
              'security',
              'logging',
              'voice_settings',
              'memory_config',
              'embeddings',
            ],
          },
          {
            name: 'key',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'value',
            type: 'text',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['string', 'number', 'boolean', 'enum'],
          },
          {
            name: 'environment',
            type: 'enum',
            enum: ['development', 'staging', 'production', 'all'],
            default: "'all'",
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'validationRules',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isSecret',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'version',
            type: 'int',
            default: 1,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'createdBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create unique constraint on key + environment
    await queryRunner.createIndex(
      'configurations',
      new TableIndex({
        name: 'UQ_configurations_key_environment',
        columnNames: ['key', 'environment'],
        isUnique: true,
      }),
    );

    // Create index on category + environment for efficient filtering
    await queryRunner.createIndex(
      'configurations',
      new TableIndex({
        name: 'IDX_configurations_category_environment',
        columnNames: ['category', 'environment'],
      }),
    );

    // Create index on isActive for efficient filtering
    await queryRunner.createIndex(
      'configurations',
      new TableIndex({
        name: 'IDX_configurations_isActive',
        columnNames: ['isActive'],
      }),
    );

    // Insert default configuration values
    await this.insertDefaultConfigurations(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('configurations');
  }

  /**
   * Insert default configuration values from .env.example
   */
  private async insertDefaultConfigurations(queryRunner: QueryRunner): Promise<void> {
    const defaultConfigs = [
      // Feature Flags
      {
        category: 'feature_flags',
        key: 'ENABLE_SEMANTIC_MEMORY',
        value: 'true',
        type: 'boolean',
        description: 'Enable or disable semantic memory features in the AI agent',
        environment: 'all',
      },
      {
        category: 'feature_flags',
        key: 'DEBUG',
        value: 'false',
        type: 'boolean',
        description: 'Enable verbose logging for development',
        environment: 'all',
      },
      {
        category: 'feature_flags',
        key: 'DEV_MODE',
        value: 'true',
        type: 'boolean',
        description: 'Enable development features',
        environment: 'all',
      },

      // Service Settings
      {
        category: 'service_settings',
        key: 'LOG_LEVEL',
        value: 'info',
        type: 'enum',
        description: 'Application logging level',
        environment: 'all',
        validationRules: JSON.stringify({
          enum: ['error', 'warn', 'info', 'debug', 'verbose'],
        }),
      },
      {
        category: 'service_settings',
        key: 'INFISICAL_CACHE_TTL',
        value: '300000',
        type: 'number',
        description: 'Cache duration for Infisical secrets in milliseconds',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 0,
          max: 3600000,
        }),
      },

      // Model Configuration
      {
        category: 'model_config',
        key: 'LLM_PROVIDER',
        value: 'ANTHROPIC',
        type: 'enum',
        description: 'Primary LLM provider selection',
        environment: 'all',
        validationRules: JSON.stringify({
          enum: ['OPENAI', 'ANTHROPIC'],
        }),
      },
      {
        category: 'model_config',
        key: 'OPENAI_MODEL',
        value: 'gpt-4-turbo-preview',
        type: 'string',
        description: 'OpenAI model selection',
        environment: 'all',
      },
      {
        category: 'model_config',
        key: 'ANTHROPIC_MODEL',
        value: 'claude-3-5-sonnet-20241022',
        type: 'string',
        description: 'Anthropic model selection',
        environment: 'all',
      },

      // ElevenLabs Configuration
      {
        category: 'voice_settings',
        key: 'ELEVENLABS_DEFAULT_TTS_MODEL',
        value: 'eleven_multilingual_v2',
        type: 'string',
        description: 'Default text-to-speech model for ElevenLabs',
        environment: 'all',
      },
      {
        category: 'voice_settings',
        key: 'ELEVENLABS_DEFAULT_STT_MODEL',
        value: 'scribe_v1',
        type: 'string',
        description: 'Default speech-to-text model for ElevenLabs',
        environment: 'all',
      },
      {
        category: 'voice_settings',
        key: 'ELEVENLABS_VOICE_STABILITY',
        value: '0.5',
        type: 'number',
        description: 'Voice stability setting for ElevenLabs TTS',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 0,
          max: 1,
        }),
      },
      {
        category: 'voice_settings',
        key: 'ELEVENLABS_VOICE_SIMILARITY_BOOST',
        value: '0.75',
        type: 'number',
        description: 'Voice similarity boost for ElevenLabs TTS',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 0,
          max: 1,
        }),
      },

      // Performance Configuration
      {
        category: 'performance',
        key: 'ELEVENLABS_MAX_CONCURRENT_REQUESTS',
        value: '3',
        type: 'number',
        description: 'Maximum concurrent requests to ElevenLabs API',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 1,
          max: 10,
        }),
      },
      {
        category: 'performance',
        key: 'ELEVENLABS_RATE_LIMIT_DELAY_MS',
        value: '1000',
        type: 'number',
        description: 'Delay between requests when rate limited (milliseconds)',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 100,
          max: 10000,
        }),
      },

      // Memory Configuration
      {
        category: 'memory_config',
        key: 'MEMORY_RETRIEVAL_THRESHOLD',
        value: '0.7',
        type: 'number',
        description: 'Threshold for semantic memory retrieval',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 0,
          max: 1,
        }),
      },
      {
        category: 'memory_config',
        key: 'MAX_MESSAGES_FOR_MEMORY',
        value: '50',
        type: 'number',
        description: 'Maximum messages to process for memory',
        environment: 'all',
        validationRules: JSON.stringify({
          min: 1,
          max: 1000,
        }),
      },

      // Embeddings Configuration
      {
        category: 'embeddings',
        key: 'OPENAI_EMBEDDING_MODEL',
        value: 'text-embedding-ada-002',
        type: 'string',
        description: 'OpenAI embedding model for vector operations',
        environment: 'all',
      },
      {
        category: 'embeddings',
        key: 'BGE_NORMALIZE_EMBEDDINGS',
        value: 'true',
        type: 'boolean',
        description: 'Normalize BGE embeddings for better performance',
        environment: 'all',
      },
    ];

    // Insert configurations
    for (const config of defaultConfigs) {
      await queryRunner.query(
        `
        INSERT INTO configurations (
          category, key, value, type, environment, description, "validationRules", "isSecret", "isActive", version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `,
        [
          config.category,
          config.key,
          config.value,
          config.type,
          config.environment,
          config.description || null,
          config.validationRules || null,
          false, // isSecret
          true, // isActive
          1, // version
        ],
      );
    }
  }
}
