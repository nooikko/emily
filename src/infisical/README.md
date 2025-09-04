# Infisical Integration

This module provides centralized secret management using [Infisical](https://infisical.com/), replacing traditional `.env` file-based configuration with a secure, encrypted secret store.

## Features

- 🔐 **Centralized Secret Management**: All secrets stored in one secure location
- 🔄 **Automatic Secret Rotation**: Support for rotating secrets without code changes
- 🌍 **Environment-Specific Secrets**: Different secrets for dev, staging, and production
- 💾 **Caching**: Built-in caching to minimize API calls
- 🔙 **Backward Compatibility**: Falls back to environment variables when needed
- 🔍 **Audit Logging**: Track who accessed which secrets and when

## Setup

### 1. Create an Infisical Account

1. Sign up at [https://infisical.com](https://infisical.com)
2. Create a new project for your application
3. Create environments (development, staging, production)

### 2. Create a Service Account

1. Go to your project settings in Infisical
2. Navigate to "Service Accounts"
3. Create a new service account with appropriate permissions
4. Save the `CLIENT_ID` and `CLIENT_SECRET`

### 3. Configure Environment Variables

Add these to your `.env` file:

```env
# Enable Infisical integration
INFISICAL_ENABLED=true

# Service account credentials
INFISICAL_CLIENT_ID=your_client_id_here
INFISICAL_CLIENT_SECRET=your_client_secret_here

# Your project ID from Infisical
INFISICAL_PROJECT_ID=your_project_id_here

# Environment to use (defaults to NODE_ENV)
INFISICAL_ENVIRONMENT=development

# Optional: Cache duration in milliseconds (default: 5 minutes)
INFISICAL_CACHE_TTL=300000

# Optional: Fall back to .env if Infisical fails (default: true)
INFISICAL_FALLBACK_TO_ENV=true
```

### 4. Add Secrets to Infisical

Upload your secrets to Infisical using one of these methods:

#### Option A: Web Dashboard
1. Go to your project in Infisical
2. Select the environment
3. Add secrets manually

#### Option B: CLI
```bash
# Install Infisical CLI
brew install infisical/get-cli/infisical

# Login
infisical login

# Set secrets
infisical secrets set OPENAI_API_KEY="your_key" --env=development
infisical secrets set ANTHROPIC_API_KEY="your_key" --env=development
```

#### Option C: Import from .env
```bash
# Import all secrets from .env file
infisical secrets set --env=development --file=.env
```

## Usage

### Basic Usage

The `InfisicalService` is available globally and can be injected into any service:

```typescript
import { Injectable } from '@nestjs/common';
import { InfisicalService } from '../infisical/infisical.service';

@Injectable()
export class MyService {
  constructor(private readonly infisical: InfisicalService) {}

  async getApiKey() {
    // Get a single secret
    const apiKey = await this.infisical.getSecret('OPENAI_API_KEY');
    
    // Get with default value
    const model = await this.infisical.getSecret('OPENAI_MODEL', 'gpt-4');
    
    return { apiKey, model };
  }

  async getMultipleSecrets() {
    // Get multiple secrets at once (more efficient)
    const secrets = await this.infisical.getSecrets([
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'DATABASE_URL'
    ]);
    
    return secrets;
  }
}
```

### Using the Configuration Factory

For structured configuration, use the `InfisicalConfigFactory`:

```typescript
import { Injectable } from '@nestjs/common';
import { InfisicalConfigFactory } from '../infisical/infisical-config.factory';

@Injectable()
export class ConfigService {
  constructor(private readonly configFactory: InfisicalConfigFactory) {}

  async getDatabaseConfig() {
    return this.configFactory.createDatabaseConfig();
  }

  async getOpenAIConfig() {
    return this.configFactory.createOpenAIConfig();
  }
}
```

## Migration Guide

### Phase 1: Setup (Current)
1. Install and configure Infisical module ✅
2. Keep `INFISICAL_ENABLED=false` initially
3. Test that application still works with `.env` files

### Phase 2: Testing
1. Upload secrets to Infisical
2. Set `INFISICAL_ENABLED=true` in development
3. Test with `INFISICAL_FALLBACK_TO_ENV=true`
4. Verify all features work correctly

### Phase 3: Gradual Migration
1. Migrate one module at a time
2. Update configuration modules to use `InfisicalService`
3. Test thoroughly after each migration

### Phase 4: Production
1. Upload production secrets to Infisical
2. Set `INFISICAL_FALLBACK_TO_ENV=false` in production
3. Remove sensitive values from `.env` files
4. Use `.env` only for non-sensitive configuration

## Environment-Specific Configuration

Infisical supports multiple environments. Configure like this:

```typescript
// Development
INFISICAL_ENVIRONMENT=development

// Staging
INFISICAL_ENVIRONMENT=staging

// Production
INFISICAL_ENVIRONMENT=production
```

## Caching

Secrets are cached to improve performance:

- Default cache TTL: 5 minutes (300000ms)
- Configurable via `INFISICAL_CACHE_TTL`
- Clear cache manually: `infisicalService.clearCache()`

## Error Handling

The module handles errors gracefully:

1. **Infisical Unavailable**: Falls back to environment variables if `INFISICAL_FALLBACK_TO_ENV=true`
2. **Missing Secrets**: Returns `undefined` or uses provided default values
3. **Invalid Credentials**: Logs error and falls back if configured

## Security Best Practices

1. **Never commit** Infisical credentials to version control
2. **Use service accounts** instead of personal credentials
3. **Limit permissions** to only what's needed
4. **Rotate credentials** regularly
5. **Use different projects** for different applications
6. **Enable audit logging** in Infisical dashboard
7. **Set `INFISICAL_FALLBACK_TO_ENV=false`** in production

## Monitoring

Check Infisical status:

```typescript
// Check if Infisical is operational
const isOperational = infisicalService.isOperational();

// Get configuration (excludes sensitive data)
const config = infisicalService.getConfig();
console.log('Infisical config:', config);
```

## Troubleshooting

### Secrets not loading
1. Check `INFISICAL_ENABLED=true`
2. Verify credentials are correct
3. Check network connectivity to Infisical
4. Review logs for error messages

### Performance issues
1. Increase `INFISICAL_CACHE_TTL`
2. Use `getSecrets()` for batch fetching
3. Check network latency to Infisical

### Fallback not working
1. Ensure `INFISICAL_FALLBACK_TO_ENV=true`
2. Verify `.env` file exists and is loaded
3. Check environment variable names match

## CLI Commands

Useful Infisical CLI commands:

```bash
# List all secrets
infisical secrets --env=development

# Get a specific secret
infisical secrets get OPENAI_API_KEY --env=development

# Set a secret
infisical secrets set API_KEY="value" --env=development

# Delete a secret
infisical secrets delete API_KEY --env=development

# Export secrets to .env format
infisical export --env=development > .env.from-infisical
```

## Testing

When running tests, you can:

1. **Mock Infisical**: Tests use mocked `InfisicalService`
2. **Use test environment**: Set `INFISICAL_ENVIRONMENT=test`
3. **Disable Infisical**: Set `INFISICAL_ENABLED=false` for tests

## Support

- [Infisical Documentation](https://infisical.com/docs)
- [Infisical Discord](https://discord.com/invite/nx3yFGGbGv)
- [GitHub Issues](https://github.com/Infisical/infisical/issues)