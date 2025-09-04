import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from './agent/agent.module';
import { ApiModule } from './api/api.module';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { Configuration } from './config/entities/configuration.entity';
import { elevenlabsConfigSchema } from './elevenlabs/config/elevenlabs-config.validation';
import { ElevenLabsModule } from './elevenlabs/elevenlabs.module';
import { infisicalConfigSchema } from './infisical/config/infisical-config.validation';
import { DatabaseConfigModule } from './infisical/database-config.module';
import { InfisicalModule } from './infisical/infisical.module';
import type { DatabaseConfig } from './infisical/infisical-config.factory';
import { InitializationModule } from './initialization/initialization.module';
import { langsmithConfigSchema } from './langsmith/config/langsmith-config.validation';
import { LangSmithModule } from './langsmith/langsmith.module';
import { MessagingModule } from './messaging/messaging.module';
import { unleashConfigSchema } from './unleash/config/unleash-config.validation';
import { UnleashModule } from './unleash/unleash.module';
import { VectorsModule } from './vectors/vectors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: infisicalConfigSchema.concat(langsmithConfigSchema).concat(elevenlabsConfigSchema).concat(unleashConfigSchema),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // TypeORM for database configuration management (Unleash + Infisical)
    TypeOrmModule.forRootAsync({
      imports: [DatabaseConfigModule],
      inject: ['DATABASE_CONFIG'],
      useFactory: async (databaseConfig: DatabaseConfig) => ({
        type: 'postgres',
        host: databaseConfig.host,
        port: databaseConfig.port,
        username: databaseConfig.username,
        password: databaseConfig.password,
        database: databaseConfig.database,
        entities: [Configuration],
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
        migrations: ['dist/config/database/migrations/*.js'],
        migrationsTableName: 'migrations',
        migrationsRun: false, // Run migrations manually via npm scripts
      }),
    }),
    // InfisicalModule must be imported first for secrets management
    InfisicalModule,
    // UnleashModule depends on InfisicalModule for UNLEASH_API_KEY, so it must come after
    UnleashModule,
    // DatabaseConfigModule provides DATABASE_CONFIG from Unleash + Infisical
    DatabaseConfigModule,
    LangSmithModule,
    ElevenLabsModule,
    VectorsModule,
    MessagingModule,
    // InitializationModule should come after base services are registered
    InitializationModule,
    AgentModule,
    ApiModule,
    // Configuration management module (includes UnifiedConfigService that depends on Infisical + Unleash)
    AppConfigModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
