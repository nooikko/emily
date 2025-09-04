# LangSmith Integration for Emily AI Agent

This module provides comprehensive LangSmith and LangChain native logging integration for the Emily AI Agent NestJS application. It enables advanced observability, tracing, and monitoring of AI operations with production-ready security features.

## Features

- **LangChain Native Tracing**: Automatic tracing for all LangChain operations
- **NestJS Integration**: Seamless integration with NestJS dependency injection
- **Data Security**: Advanced data masking with comprehensive pattern matching
- **Production Ready**: Environment-based configuration with validation
- **Cloud & Self-Hosted**: Support for both LangSmith cloud and self-hosted deployments
- **Performance Optimized**: Async logging to prevent application latency
- **Health Monitoring**: Built-in health checks and status reporting

## Quick Start

### 1. Environment Configuration

Copy the `.env.example` file and configure your LangSmith settings:

```bash
# Required: Get your API key from https://smith.langchain.com/
LANGSMITH_API_KEY=your_langsmith_api_key_here

# Enable tracing
LANGSMITH_TRACING=true

# Project name for organizing traces
LANGCHAIN_PROJECT=emily-development

# Performance optimization (true for non-serverless)
LANGCHAIN_CALLBACKS_BACKGROUND=true

# Security (recommended for production)
LANGSMITH_HIDE_INPUTS=false
LANGSMITH_HIDE_OUTPUTS=false
```

### 2. Module Import

The LangSmith module is automatically imported in the main AppModule:

```typescript
import { LangSmithModule } from './langsmith/langsmith.module';

@Module({
  imports: [LangSmithModule, /* other modules */],
})
export class AppModule {}
```

### 3. Automatic Tracing

Tracing is automatically enabled for:
- All HTTP requests via global interceptor
- ReactAgent chat and stream operations
- Vector store operations (Qdrant)
- Memory system operations

## Architecture

### Core Components

```
src/langsmith/
├── config/                          # Configuration management
│   ├── langsmith.config.ts          # Configuration factory
│   └── langsmith-config.validation.ts # Joi validation schema
├── services/                        # Core services  
│   ├── langsmith.service.ts         # Main LangSmith service
│   └── data-masking.service.ts      # Advanced data masking
├── interceptors/                    # NestJS interceptors
│   └── langsmith-tracing.interceptor.ts # Global tracing interceptor
├── types/                          # TypeScript definitions
│   └── langsmith-config.interface.ts # Configuration interfaces
├── langsmith.module.ts             # Main module
├── langsmith-config.module.ts      # Configuration module
└── index.ts                        # Exports
```

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LANGSMITH_API_KEY` | ✅ | - | LangSmith API key |
| `LANGSMITH_TRACING` | ❌ | `true` | Enable/disable tracing |
| `LANGCHAIN_PROJECT` | ✅ | - | Project name for traces |
| `LANGSMITH_ENDPOINT` | ❌ | Cloud | API endpoint (for self-hosted) |
| `LANGCHAIN_CALLBACKS_BACKGROUND` | ❌ | `true` | Async processing |
| `LANGSMITH_HIDE_INPUTS` | ❌ | `false` | Hide inputs in traces |
| `LANGSMITH_HIDE_OUTPUTS` | ❌ | `false` | Hide outputs in traces |

### Production Configuration

For production deployments:

```bash
NODE_ENV=production
LANGSMITH_HIDE_INPUTS=true
LANGSMITH_HIDE_OUTPUTS=true
LANGCHAIN_CALLBACKS_BACKGROUND=false  # For serverless only
```

## Data Security & Masking

### Built-in Masking Patterns

The system automatically masks sensitive data including:

- **Personal Information**: Email addresses, phone numbers, SSN
- **Financial Data**: Credit cards, bank accounts, routing numbers
- **Credentials**: API keys, passwords, tokens, bearer tokens
- **Technical**: Database URLs, IP addresses, coordinates
- **Healthcare**: Medical record numbers, insurance IDs

### Advanced Masking

```typescript
// Custom masking patterns
const customPatterns = {
  'CUSTOM_ID_\\d{6}': '[CUSTOM_ID_REDACTED]',
  'SECRET_[A-Z0-9]+': '[SECRET_REDACTED]'
};

// Apply masking
const maskedData = dataMaskingService.maskText(sensitiveText, customPatterns);
```

### Validation

Validate masking effectiveness:

```typescript
const validation = dataMaskingService.validateMasking(maskedData);
if (!validation.isValid) {
  console.warn('Masking warnings:', validation.warnings);
}
```

## Usage Examples

### Manual Tracing

```typescript
import { traceable } from 'langsmith/traceable';

const myFunction = traceable(
  async (input: any) => {
    // Your function logic
    return result;
  },
  {
    name: 'my-custom-function',
    metadata: { customField: 'value' }
  }
);
```

### Service Integration

```typescript
@Injectable()
export class MyService {
  constructor(
    @Optional() private readonly langsmithService?: LangSmithService
  ) {}

  async processData(data: any) {
    if (this.langsmithService?.isEnabled()) {
      // Custom tracing logic
      const traceable = this.createTraceable('MyService.processData', async () => {
        return this.executeProcess(data);
      });
      return traceable();
    }
    
    return this.executeProcess(data);
  }
}
```

### Health Monitoring

```typescript
// Check LangSmith service health
const health = await langsmithService.checkHealth();
if (!health.connected) {
  console.warn(`LangSmith offline: ${health.error}`);
}

// Log tracing status
langsmithService.logTracingStatus();
```

## Docker Configuration

### Cloud Deployment (Recommended)

Use the default docker-compose.yml configuration with cloud LangSmith:

```yaml
# No additional services needed for cloud deployment
# Just configure environment variables
```

### Self-Hosted Deployment

Uncomment the LangSmith services in docker-compose.yml:

```yaml
services:
  langsmith-postgres:
    image: postgres:15
    # ... configuration
  
  langsmith-redis:
    image: redis:7-alpine  
    # ... configuration
    
  langsmith-backend:
    image: langchain/langsmith:latest
    environment:
      - LANGSMITH_LICENSE_KEY=${LANGSMITH_LICENSE_KEY}
    # ... configuration
```

## Performance Considerations

### Background Processing

For optimal performance in non-serverless environments:
```bash
LANGCHAIN_CALLBACKS_BACKGROUND=true
```

For serverless deployments (Vercel, AWS Lambda):
```bash
LANGCHAIN_CALLBACKS_BACKGROUND=false
```

### Memory Usage

The system uses minimal memory overhead:
- Async trace processing prevents blocking
- Data masking operates on copies
- Configurable trace retention

## Troubleshooting

### Common Issues

1. **Tracing not appearing**:
   - Verify `LANGSMITH_API_KEY` is set
   - Check `LANGSMITH_TRACING=true`
   - Confirm network connectivity

2. **Performance impact**:
   - Enable `LANGCHAIN_CALLBACKS_BACKGROUND=true`
   - Consider disabling in development if needed

3. **Data masking too aggressive**:
   - Review `SENSITIVE_FIELD_NAMES` configuration
   - Customize patterns in `DataMaskingService`

4. **Self-hosted connection issues**:
   - Verify `LANGSMITH_ENDPOINT` configuration
   - Check Docker network connectivity
   - Confirm license key validity

### Debugging

Enable debug logging:
```bash
LOG_LEVEL=debug
DEBUG=true
```

Check service status:
```typescript
const isEnabled = langsmithService.isEnabled();
const config = langsmithService.getConfig();
const health = await langsmithService.checkHealth();
```

## Best Practices

### Development
- Use separate projects for dev/staging/prod
- Keep `LANGSMITH_HIDE_INPUTS=false` for debugging
- Monitor trace volumes to avoid quota issues

### Production
- Set `LANGSMITH_HIDE_INPUTS=true`
- Set `LANGSMITH_HIDE_OUTPUTS=true`
- Use strong passwords for self-hosted deployments
- Enable SSL/TLS for database connections
- Regular health monitoring

### Security
- Never commit API keys to version control
- Use environment-specific configurations
- Regularly validate masking effectiveness
- Monitor for sensitive data leaks

## Migration Guide

### From Raw LangChain

Replace direct LangChain usage:

```typescript
// Before
import { ChatOpenAI } from '@langchain/openai';
const model = new ChatOpenAI();

// After - Automatic tracing enabled
// No code changes needed, tracing is automatic
```

### From Other Observability Tools

The LangSmith integration can coexist with other monitoring tools:
- Prometheus metrics
- Custom logging systems
- APM tools (New Relic, DataDog)

## Support

- LangSmith Documentation: https://docs.langchain.com/langsmith
- Enterprise Support: Contact LangChain sales for self-hosted deployments
- Issue Tracking: Use project issue tracker for integration-specific problems