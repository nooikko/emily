# Research: Unleash Feature Flag Integration with NestJS

Date: 2025-09-03
Requested by: @project-coordinator

## Summary

Researched official Unleash Node.js SDK integration with NestJS, configuration management strategies, and testing patterns for feature flag implementation. Found multiple approaches including official SDK usage and community NestJS-specific packages.

## Prior Research

Reference to existing: AI_RESEARCH/2025-09-01-configuration-database-migration.md
This research identified feature flags as high-priority candidates for database migration, including Infisical, LangSmith, ElevenLabs toggles, and service feature flags.

## Current Findings

### 1. Official Unleash Node.js SDK Integration

**Package Details:**
- **Official npm package**: `unleash-client`
- **Installation**: `npm install unleash-client` or `yarn add unleash-client`

**Basic Integration with NestJS:**
```typescript
import { initialize } from 'unleash-client';

const unleash = initialize({
  url: 'https://YOUR-API-URL',
  appName: 'my-node-name',
  customHeaders: { Authorization: '<YOUR_API_TOKEN>' },
  environment: 'production',
  instanceId: 'unique-instance-id',
  refreshInterval: 15000, // Poll interval (default 15000ms)
  metricsInterval: 60000, // Metrics send frequency (default 60000ms)
  timeout: 10000 // HTTP request timeout (default 10000ms)
});

// Basic feature flag checking
const isEnabled = unleash.isEnabled('DemoToggle');

// With context
const context = { userId: '123', properties: { region: 'EMEA' } };
const enabled = unleash.isEnabled('someToggle', context);
```

**Error Handling:**
```typescript
unleash.on('error', console.error);
unleash.on('warn', console.warn);
unleash.on('ready', () => console.log('Unleash is ready'));
unleash.on('synchronized', () => console.log('Unleash synchronized'));
```

### 2. Community NestJS-Unleash Package

**Package**: `nestjs-unleash` (version 2.2.4)
- **Note**: Last updated 2 years ago, but still functional
- **Installation**: `npm install nestjs-unleash`

**Module Configuration:**

Synchronous:
```typescript
@Module({
  imports: [
    UnleashModule.forRoot({
      url: "https://example.com/unleash",
      appName: "my-app-name",
      instanceId: "my-unique-instance",
    }),
  ],
})
export class MyModule {}
```

Asynchronous (recommended with ConfigService):
```typescript
@Module({
  imports: [
    UnleashModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        url: config.get("UNLEASH_URL"),
        appName: config.get("UNLEASH_APP_NAME"),
        instanceId: config.get("UNLEASH_INSTANCE_ID"),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class MyModule {}
```

**Service Usage with Decorators:**
```typescript
@Controller()
export class AppController {
  constructor(private readonly unleash: UnleashService) {}

  @Get("/")
  index(): string {
    return this.unleash.isEnabled("test")
      ? "feature is active"
      : "feature is not active";
  }

  @IfEnabled("test")
  @Get("/foo")
  getFoo(): string {
    return "my foo";
  }
}
```

### 3. Configuration Migration Strategy

**Separation of Concerns (Based on Best Practices):**

**Feature Flags → Unleash:**
- Service feature toggles (INFISICAL_ENABLED, LANGSMITH_TRACING)
- Experimental features (ENABLE_SEMANTIC_MEMORY, DEBUG, DEV_MODE)
- A/B testing flags
- Runtime behavior toggles
- Environment-specific feature rollouts

**Secrets → Infisical (Keep Current):**
- API keys (UNLEASH_API_TOKEN, LANGSMITH_API_KEY, ELEVENLABS_API_KEY)
- Database credentials
- Service account credentials
- Certificates and private keys

**Service Configuration → Database (As Previously Researched):**
- Service settings (cache TTL, retry counts, timeouts)
- Model selections and parameters
- Performance tuning values
- Non-sensitive operational parameters

**Infrastructure → Environment Variables (Keep Current):**
- Service URLs and endpoints
- Port configurations
- SSL/TLS settings
- Deployment-specific values

### 4. Implementation Architecture

**Recommended NestJS Service Structure:**
```typescript
// unleash-config.interface.ts
export interface UnleashConfig {
  readonly url: string;
  readonly appName: string;
  readonly instanceId: string;
  readonly apiToken: string;
  readonly environment: string;
  readonly refreshInterval: number;
  readonly metricsInterval: number;
  readonly timeout: number;
}

// unleash.module.ts
@Module({
  imports: [ConfigModule],
  providers: [UnleashService, UnleashConfigFactory],
  exports: [UnleashService],
})
export class UnleashModule {}

// unleash.service.ts
@Injectable()
export class UnleashService implements OnModuleInit {
  private client: ReturnType<typeof initialize> | null = null;
  private readonly logger = new Logger(UnleashService.name);

  constructor(
    private readonly configFactory: UnleashConfigFactory,
    private readonly infisicalService: InfisicalService
  ) {}

  async onModuleInit() {
    const config = await this.configFactory.createUnleashConfig();
    
    this.client = initialize({
      url: config.url,
      appName: config.appName,
      instanceId: config.instanceId,
      customHeaders: { Authorization: config.apiToken },
      environment: config.environment,
      refreshInterval: config.refreshInterval,
      metricsInterval: config.metricsInterval,
      timeout: config.timeout,
    });

    this.client.on('error', (err) => this.logger.error('Unleash error:', err));
    this.client.on('warn', (warning) => this.logger.warn('Unleash warning:', warning));
    this.client.on('ready', () => this.logger.log('Unleash client ready'));
  }

  isEnabled(toggleName: string, context?: any): boolean {
    if (!this.client) {
      this.logger.warn(`Unleash client not initialized, returning false for ${toggleName}`);
      return false;
    }
    return this.client.isEnabled(toggleName, context);
  }

  getVariant(toggleName: string, context?: any): any {
    if (!this.client) {
      this.logger.warn(`Unleash client not initialized, returning default variant for ${toggleName}`);
      return { name: 'disabled', enabled: false };
    }
    return this.client.getVariant(toggleName, context);
  }
}
```

**Error Handling and Fallback Strategies:**
```typescript
// Feature flag wrapper with fallback
@Injectable()
export class FeatureFlagService {
  constructor(private readonly unleashService: UnleashService) {}

  isFeatureEnabled(flag: string, defaultValue: boolean = false, context?: any): boolean {
    try {
      return this.unleashService.isEnabled(flag, context);
    } catch (error) {
      this.logger.warn(`Feature flag ${flag} evaluation failed, using default: ${defaultValue}`, error);
      return defaultValue;
    }
  }
}
```

### 5. Testing Patterns

**Unit Testing with Mocking:**

**Mock Approach (Recommended):**
```typescript
// unleash.service.mock.ts
export const mockUnleashService = {
  isEnabled: jest.fn(),
  getVariant: jest.fn(),
};

// service.spec.ts
describe('ServiceWithFeatureFlag', () => {
  let service: ServiceWithFeatureFlag;
  let unleashService: jest.Mocked<UnleashService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceWithFeatureFlag,
        {
          provide: UnleashService,
          useValue: mockUnleashService,
        },
      ],
    }).compile();

    service = module.get<ServiceWithFeatureFlag>(ServiceWithFeatureFlag);
    unleashService = module.get(UnleashService);
  });

  it('should enable feature when flag is true', () => {
    unleashService.isEnabled.mockReturnValue(true);
    
    const result = service.someMethodWithFlag();
    
    expect(unleashService.isEnabled).toHaveBeenCalledWith('my-feature-flag');
    expect(result).toBe('feature enabled behavior');
  });

  it('should disable feature when flag is false', () => {
    unleashService.isEnabled.mockReturnValue(false);
    
    const result = service.someMethodWithFlag();
    
    expect(result).toBe('default behavior');
  });
});
```

**Integration Testing with Test Environment:**
```typescript
// Use InMemStorageProvider for integration tests
import { InMemStorageProvider } from 'unleash-client';

const testUnleash = initialize({
  url: 'http://localhost:4242/api',
  appName: 'test-app',
  storageProvider: new InMemStorageProvider(),
  disableMetrics: true,
  bootstrap: [
    { name: 'test-feature', enabled: true, strategies: [{ name: 'default' }] }
  ]
});
```

**MSW Mocking for Network Requests:**
```typescript
// Mock Unleash API responses
export const unleashHandlers = [
  rest.get('*/api/client/features', (req, res, ctx) => {
    return res(
      ctx.json({
        features: [
          { name: 'test-feature', enabled: true, strategies: [{ name: 'default' }] }
        ]
      })
    );
  })
];
```

### 6. Configuration Factory Integration

**Following Existing Infisical Pattern:**
```typescript
// unleash-config.factory.ts
@Injectable()
export class UnleashConfigFactory {
  constructor(private readonly infisicalService: InfisicalService) {}

  async createUnleashConfig(): Promise<UnleashConfig> {
    const secrets = await this.infisicalService.getSecrets([
      'UNLEASH_URL',
      'UNLEASH_API_TOKEN'
    ]);

    return {
      url: secrets.UNLEASH_URL || 'http://localhost:4242/api',
      appName: 'emily-ai-agent',
      instanceId: process.env.INSTANCE_ID || 'emily-instance',
      apiToken: secrets.UNLEASH_API_TOKEN!,
      environment: process.env.NODE_ENV || 'development',
      refreshInterval: 15000,
      metricsInterval: 60000,
      timeout: 10000,
    };
  }
}
```

## Key Takeaways

- **Dual-system approach**: Use Unleash for feature flags, Infisical for secrets, database for service configuration
- **Official SDK preferred**: Use `unleash-client` directly rather than the outdated community package for better control
- **Service layer pattern**: Create abstraction layer for better testability and provider independence
- **Fallback strategy**: Always implement graceful degradation when feature flag service is unavailable
- **Testing isolation**: Mock feature flag service in unit tests, use bootstrap data for integration tests
- **Configuration separation**: Keep API tokens in Infisical, feature flag logic in Unleash, service parameters in database

## Gotchas and Warnings

- Community `nestjs-unleash` package is 2 years old - prefer direct SDK integration
- Always implement fallback values for feature flags
- Don't store secrets in Unleash - use it only for boolean/variant flags
- Feature flag evaluation should be fast - implement caching if needed
- Test both enabled and disabled states of all features
- Set expiration dates for feature flags to avoid technical debt

## Sources

- Official Unleash Node.js SDK: https://docs.getunleash.io/reference/sdks/node
- Unleash Client Node.js: https://www.npmjs.com/package/unleash-client
- NestJS-Unleash Community Package: https://www.npmjs.com/package/nestjs-unleash
- Feature Flag Testing Best Practices: https://www.getunleash.io/blog/two-approaches-to-testing-software-with-feature-flags
- Configuration Management Best Practices: https://docs.getunleash.io/topics/feature-flags/feature-flag-best-practices
- Unleash GitHub Repository: https://github.com/Unleash/unleash-client-node