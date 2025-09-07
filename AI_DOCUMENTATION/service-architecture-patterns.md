# Service Architecture Patterns in Emily

## Core Service Relationships

### Agent Service Architecture
```
HTTP Request → AgentController → AgentService → ReactAgent → LLM/Memory
                    ↓              ↓            ↓
                API Layer     Service Layer  Business Layer
```

- **AgentController**: REST endpoints, Swagger docs, HTTP validation
- **AgentService**: HTTP-specific logic, Redis streaming, error formatting  
- **ReactAgent**: LLM operations, memory management, conversation logic

### Configuration Service Hierarchy
```
Application Code
     ↓
UnifiedConfigService (smart routing)
     ↓         ↓
ConfigService  InfisicalService
(env vars)     (secrets)
```

**Usage Patterns:**
- Use `ConfigService` directly for: Basic env vars, non-sensitive config
- Use `InfisicalService` directly for: Secret-specific operations, caching
- Use `UnifiedConfigService` for: Smart multi-source resolution, fallback logic

### Memory Service Integration
```
ReactAgent → HybridMemoryService → MemoryService (Qdrant) + PostgresSaver
                    ↓                       ↓              ↓
              Vector Search           Semantic Memory   Conversation History
```

### Database Configuration Sources
- **Application DB Config**: `DatabaseConfigModule` → `InfisicalConfigFactory` (secure)
- **Admin DB Operations**: `InitializationService` → Direct env vars (admin tasks)
- **Different purposes, different approaches - this is intentional**

## Service Initialization Order

Critical dependencies managed through module imports in `app.module.ts`:

1. `ObservabilityModule` - Early telemetry setup
2. `InfisicalModule` - Must be first for secrets
3. `DatabaseConfigModule` - Depends on Infisical
4. Service modules (`LangSmithModule`, `VectorsModule`, etc.)
5. `InitializationModule` - Validation after services are up
6. `AgentModule` + `ApiModule` - Application logic
7. `AppConfigModule` - Unified config (depends on Infisical)
8. `HealthModule` - Status monitoring

## Error Handling Patterns by Layer

### Domain Services (Rich Error Types)
```typescript
// Configuration services
abstract class ConfigError extends Error
class ConfigValidationError extends ConfigError  
class ConfigFetchError extends ConfigError

// Vector services  
class VectorStoreError extends Error {
  constructor(message, code, originalError)
}
```

### API Services (Error Transformation)
```typescript
// AgentService pattern
function toErrorWithMessage(maybeError: unknown): ErrorWithMessage
function getErrorMessage(error: unknown): string
```

### Infrastructure Services (Standard Errors)
```typescript
// InfisicalService, etc.
throw new Error("Descriptive message")
```

## Testing Patterns

### Concurrent Test Splitting
Large service test suites are split into focused files for Jest parallelization:
```
service.spec.ts (placeholder with references)
├── service.core.spec.ts
├── service.operations.spec.ts  
├── service.lifecycle.spec.ts
└── service.logging.spec.ts
```

Benefits:
- Parallel test execution
- Faster CI/CD pipeline
- Easier to maintain focused test suites
- Better test organization

## Key Design Principles Observed

1. **Separation of Concerns**: Clear boundaries between layers
2. **Security by Design**: Sensitive data handled by specialized services
3. **Performance Conscious**: Test splitting, appropriate caching
4. **Fault Tolerant**: Graceful fallbacks, robust initialization
5. **Observable**: Comprehensive logging and telemetry integration

## Integration Points to Remember

- **Redis**: Used for SSE streaming between AgentService and clients
- **PostgreSQL**: Both application data (TypeORM) and LangGraph checkpointing
- **Qdrant**: Vector storage for semantic memory (when enabled)
- **Infisical**: Centralized secret management with fallback to env vars
- **LangSmith**: Optional tracing and monitoring (when configured)