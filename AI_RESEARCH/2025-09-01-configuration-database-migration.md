# Configuration Database Migration Analysis

Date: 2025-09-01
Research Focus: Environment variable to database migration for dynamic configuration management

## Current Configuration Analysis

### Configuration Categories from .env.example

#### 1. Application Core Settings (Candidates for Database)
- `NODE_ENV` - Environment identifier (keep as env var for startup)
- `PORT` - Application port (keep as env var)
- `LOG_LEVEL` - Logging level (DATABASE - runtime configurable)

#### 2. Service Feature Flags (DATABASE - High Priority)
- `INFISICAL_ENABLED` - Enable/disable secret management
- `LANGSMITH_TRACING` - Enable/disable tracing
- `ELEVENLABS_HEALTH_CHECK_ENABLED` - Health check toggle
- `ENABLE_SEMANTIC_MEMORY` - Memory feature toggle
- `DEBUG` - Debug mode flag
- `DEV_MODE` - Development features flag

#### 3. Service Configuration (DATABASE - Runtime Configurable)

**Infisical Settings:**
- `INFISICAL_CACHE_TTL` - Cache duration (300000ms default)
- `INFISICAL_FALLBACK_TO_ENV` - Fallback behavior
- `INFISICAL_ENVIRONMENT` - Environment context

**LangSmith Settings:**
- `LANGCHAIN_PROJECT` - Project name for traces
- `LANGCHAIN_CALLBACKS_BACKGROUND` - Performance setting
- `LANGSMITH_HIDE_INPUTS` - Security setting
- `LANGSMITH_HIDE_OUTPUTS` - Security setting

**ElevenLabs Configuration:**
- `ELEVENLABS_DEFAULT_TTS_MODEL` - TTS model selection
- `ELEVENLABS_DEFAULT_STT_MODEL` - STT model selection
- `ELEVENLABS_MAX_CONCURRENT_REQUESTS` - Rate limiting (3 default)
- `ELEVENLABS_RATE_LIMIT_DELAY_MS` - Delay settings (1000ms)
- `ELEVENLABS_MAX_RETRIES` - Retry attempts (3 default)
- `ELEVENLABS_RETRY_DELAY_MS` - Retry delays (2000ms)
- `ELEVENLABS_DEFAULT_OUTPUT_FORMAT` - Audio format
- `ELEVENLABS_VOICE_STABILITY` - Voice settings (0.5)
- `ELEVENLABS_VOICE_SIMILARITY_BOOST` - Voice settings (0.75)
- `ELEVENLABS_VOICE_STYLE` - Style settings (0.0)
- `ELEVENLABS_VOICE_USE_SPEAKER_BOOST` - Audio quality
- `ELEVENLABS_ENABLE_LOGGING` - Service logging
- `ELEVENLABS_LOG_AUDIO_DATA` - Audio data logging
- `ELEVENLABS_HEALTH_CHECK_INTERVAL_MS` - Monitoring interval

**LLM Provider Configuration:**
- `LLM_PROVIDER` - Provider selection (OPENAI/ANTHROPIC)
- `OPENAI_MODEL` - Model selection
- `ANTHROPIC_MODEL` - Model selection

**Memory Configuration:**
- `MEMORY_RETRIEVAL_THRESHOLD` - Retrieval sensitivity (0.7)
- `MAX_MESSAGES_FOR_MEMORY` - Message limits (50)
- `MEMORY_BATCH_SIZE` - Batch processing (5)

**Embeddings Configuration:**
- `OPENAI_EMBEDDING_MODEL` - Model selection
- `BGE_MODEL_NAME` - Alternative model
- `BGE_NORMALIZE_EMBEDDINGS` - Processing flag

#### 4. Secrets & Credentials (KEEP AS ENV VARS - Security)
- All API keys (`LANGSMITH_API_KEY`, `ELEVENLABS_API_KEY`, etc.)
- Database credentials (`DB_*`, `REDIS_*`)
- Service account credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`)

#### 5. Infrastructure Settings (KEEP AS ENV VARS - Deployment)
- Database connection strings
- Service URLs and endpoints
- SSL/TLS configurations

## Database Migration Strategy

### Database Schema Requirements

```typescript
// Configuration Entity Structure
interface ConfigurationEntity {
  id: string;
  category: string; // 'feature_flags', 'service_settings', 'model_config', etc.
  key: string; // Configuration key
  value: string | number | boolean; // Configuration value
  description?: string; // Human-readable description
  type: 'string' | 'number' | 'boolean' | 'enum'; // Value type
  validationRules?: object; // JSON validation rules
  isSecret: boolean; // Mark sensitive values
  environment: string; // Environment scope (dev, staging, prod)
  createdAt: Date;
  updatedAt: Date;
  version: number; // For change tracking
}
```

### API Endpoint Requirements

#### Configuration Management Endpoints
1. `GET /api/v1/config` - Get all configurations (filtered by category/environment)
2. `GET /api/v1/config/:key` - Get specific configuration
3. `PUT /api/v1/config/:key` - Update configuration value
4. `POST /api/v1/config` - Create new configuration
5. `DELETE /api/v1/config/:key` - Remove configuration
6. `GET /api/v1/config/categories` - List available categories
7. `GET /api/v1/config/schema` - Get configuration schema/validation rules

#### Administrative Endpoints
1. `POST /api/v1/config/bulk` - Bulk update configurations
2. `GET /api/v1/config/history/:key` - Configuration change history
3. `POST /api/v1/config/validate` - Validate configuration set
4. `POST /api/v1/config/reload` - Reload configuration cache

### Security Considerations

1. **Never Store Secrets in Database**: API keys and credentials remain in environment variables
2. **Access Control**: Implement role-based access to configuration endpoints
3. **Audit Trail**: Track all configuration changes with timestamps and user attribution
4. **Validation**: Strict validation rules for each configuration type
5. **Environment Isolation**: Separate configurations by environment

### ORM Evaluation Criteria

1. **TypeORM** (Currently Installed)
   - ✅ Already in dependencies
   - ✅ Native NestJS integration
   - ✅ Decorators and entity management
   - ✅ Migration system
   - ❌ No built-in caching for config

2. **Prisma**
   - ✅ Type-safe queries
   - ✅ Excellent migration tools
   - ✅ Modern ORM features
   - ❌ Additional dependency
   - ❌ Migration complexity

3. **LangChain Postgres**
   - ✅ Already using for checkpoints
   - ❌ Limited ORM features
   - ❌ Not designed for general entities
   - ❌ Overkill for configuration

**Recommendation**: Stick with TypeORM for consistency and existing integration.

## Implementation Priority

### Phase 1: Core Infrastructure
1. Create configuration entity and repository
2. Set up database migrations
3. Implement basic CRUD service
4. Create configuration module

### Phase 2: API Endpoints
1. Create configuration controller
2. Implement all CRUD endpoints
3. Add validation and error handling
4. Set up Swagger documentation

### Phase 3: Migration & Integration
1. Migrate existing configurations
2. Update service modules to use database config
3. Implement configuration caching
4. Add environment-specific handling

### Phase 4: Advanced Features
1. Configuration versioning
2. Change history tracking
3. Bulk operations
4. Configuration validation rules

## Technical Requirements Summary

- **Database**: Use existing TypeORM setup with PostgreSQL
- **Caching**: Implement Redis-based configuration caching
- **Validation**: Use class-validator for runtime validation
- **Documentation**: Complete Swagger/OpenAPI documentation
- **Testing**: Comprehensive unit tests with MSW mocking
- **Migration**: Safe migration from env vars to database
- **Security**: No secrets in database, audit trail for changes