# Research: LangSmith and LangChain Logging Integration for NestJS Applications

Date: 2025-09-01
Requested by: User

## Summary

This research provides comprehensive information about integrating LangSmith and LangChain logging capabilities into NestJS applications, covering architecture requirements, deployment options, native logging capabilities, integration patterns, and production considerations for 2025.

## Prior Research

No prior research files were found in AI_RESEARCH/ related to LangSmith or LangChain integration.

## Current Findings

### 1. LangSmith Architecture & Requirements

#### Core Platform Capabilities
- **Purpose**: Platform for building production-grade LLM applications
- **Framework Agnostic**: Works with or without LangChain's open source frameworks
- **Core Features**:
  - Tracing: Provides visibility into application request handling
  - Evaluation: Measures application quality over time
  - Prompt Engineering: Supports prompt version control and collaboration

#### Official Deployment Methods
- **Cloud Deployment**: Managed service option
- **Hybrid Deployment**: Mixed cloud/on-premises setup
- **Self-Hosted**: Enterprise plan add-on for largest, security-conscious customers

#### Docker Compatibility & Requirements

**System Requirements:**
- Minimum 4 vCPUs and 16GB Memory
- Sufficient disk space (LangSmith can require significant storage)
- Docker installed and running (`docker info` to verify)

**Prerequisites:**
- LangSmith License Key (Enterprise Plan required for self-hosting)
- Contact sales team for licensing

**Docker Compose Setup:**
```bash
# Fetch docker-compose.yml from LangSmith SDK repository
# Copy .env.example to .env and configure
# Start services
docker-compose up -d

# Validate deployment
curl localhost:1980/info
# Access UI at http://localhost:1980
```

#### Required Environment Variables
- **LANGSMITH_TRACING**: Set to `true` to enable tracing
- **LANGSMITH_API_KEY**: Your API key for authentication
- **License Configuration**: Secret key generation using `openssl rand -base64 32`
- **Database**: PostgreSQL connection details
- **Redis**: For pub-sub and caching
- **Secret Key**: Random string for internal operations

#### API Endpoints & Authentication
- **Cloud Endpoints**: 
  - US: `https://api.smith.langchain.com`
  - EU: `https://eu.api.smith.langchain.com`
- **Self-hosted**: Default at `localhost:1980`
- **Authentication**: API key-based authentication
- **Egress Requirements**: Must allow connections to `https://beacon.langchain.com` for license verification

#### Integration Patterns
- Supports Python and JavaScript SDKs
- Framework integrations: LangChain, LangGraph, OpenAI, Anthropic, Vercel AI SDK
- Automatic instrumentation when environment variables are set
- Manual instrumentation using `getLangchainCallbacks()`

### 2. LangChain Native Logging

#### Built-in Logging Capabilities
- **Automatic Tracing**: Enabled via environment variables (`LANGSMITH_TRACING=true`)
- **Trace Types**: LLM traces, Retriever traces, Distributed tracing, Multimodal traces
- **Metadata Support**: Can add metadata and tags to traces
- **Cost Tracking**: Token-based cost calculations

#### Configuration Options

**Basic Configuration (TypeScript/JavaScript):**
```typescript
// Environment Variables
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=<your-api-key>
export LANGCHAIN_PROJECT=<project-name>

// Performance Configuration
// Non-serverless environments
export LANGCHAIN_CALLBACKS_BACKGROUND=true
// Serverless environments
export LANGCHAIN_CALLBACKS_BACKGROUND=false
```

**Code Example:**
```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant"],
  ["user", "{input}"]
]);

const model = new ChatOpenAI();
const chain = prompt.pipe(model).pipe(new StringOutputParser());
// Tracing automatically enabled with environment variables
```

#### Tracing and Observability Features
- **Deep Visibility**: Complex agent behavior tracking
- **Execution Paths**: Visualization of trace execution
- **State Transitions**: Capture of state changes
- **Distributed Tracing**: Cross-service trace correlation
- **Online Evaluations**: Real-time performance assessment

#### Best Practices for Structured Logging
- Use project-specific configurations
- Implement proper metadata tagging
- Enable background processing for non-serverless environments
- Disable background processing for serverless (Vercel, AWS Lambda)

#### Integration with External Logging Services
- **Langfuse Integration**: Alternative observability platform
  ```typescript
  import { CallbackHandler } from "langfuse-langchain";
  const langfuseHandler = new CallbackHandler({
    secretKey: "sk-lf-...",
    publicKey: "pk-lf-...",
    baseUrl: "https://cloud.langfuse.com"
  });
  ```

#### Performance Considerations
- **Async Logging**: Background processing prevents application latency
- **No Performance Impact**: Callback handlers run as distributed async processes
- **Serverless Optimization**: Synchronous processing for serverless environments

### 3. NestJS Integration Patterns

#### LangChain as "NestJS of AI Workflows"
- Similar architectural philosophy: modularity and composition
- NestJS handles routing, middleware, DI; LangChain handles models, chains, tools
- Both frameworks combine complex functionality into extensible building blocks

#### Service Implementation Patterns

**Basic LangChain Service:**
```typescript
@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  
  constructor(
    @Inject('LANGCHAIN_CONFIG') private config: LangChainConfig
  ) {}

  async createChain() {
    const model = new ChatOpenAI({
      apiKey: this.config.openaiApiKey,
      temperature: 0.7
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a helpful assistant"],
      ["user", "{input}"]
    ]);
    
    return prompt.pipe(model).pipe(new StringOutputParser());
  }
}
```

#### Interceptor Approaches for Logging

**Performance Logging Interceptor:**
```typescript
@Injectable()
export class LangChainLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LangChainLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const startTime = performance.now();
    const functionName = context.getHandler().name;
    
    this.logger.log(`LangChain operation ${functionName} started`);
    
    return next.handle().pipe(
      tap(async (response) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        this.logger.log({
          operation: functionName,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          responseSize: JSON.stringify(response).length
        });
      }),
      catchError((error) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        this.logger.error({
          operation: functionName,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          error: error.message
        });
        
        throw error;
      })
    );
  }
}
```

#### Environment Configuration Management

**Configuration Module:**
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        LANGSMITH_API_KEY: Joi.string().required(),
        LANGSMITH_TRACING: Joi.boolean().default(true),
        LANGCHAIN_PROJECT: Joi.string().required(),
        OPENAI_API_KEY: Joi.string().required()
      })
    })
  ],
  providers: [
    {
      provide: 'LANGCHAIN_CONFIG',
      useFactory: (configService: ConfigService) => ({
        langsmithApiKey: configService.get('LANGSMITH_API_KEY'),
        langsmithTracing: configService.get('LANGSMITH_TRACING'),
        langchainProject: configService.get('LANGCHAIN_PROJECT'),
        openaiApiKey: configService.get('OPENAI_API_KEY')
      }),
      inject: [ConfigService]
    }
  ],
  exports: ['LANGCHAIN_CONFIG']
})
export class LangChainConfigModule {}
```

#### Dependency Injection Patterns

**Service Registration:**
```typescript
@Module({
  imports: [LangChainConfigModule],
  providers: [
    LangChainService,
    {
      provide: 'LANGCHAIN_CLIENT',
      useFactory: (config: LangChainConfig) => {
        return new Client({
          apiKey: config.langsmithApiKey,
          hideInputs: process.env.NODE_ENV === 'production',
          hideOutputs: process.env.NODE_ENV === 'production'
        });
      },
      inject: ['LANGCHAIN_CONFIG']
    }
  ],
  exports: [LangChainService, 'LANGCHAIN_CLIENT']
})
export class LangChainModule {}
```

#### Middleware vs Interceptor Approaches

**Middleware Approach:**
- Execute before route handlers
- Good for authentication, request preprocessing
- Access to raw request/response objects

**Interceptor Approach (Recommended for LangChain):**
- Wrap around method execution
- Transform responses and bind extra logic
- Better for performance monitoring and logging
- Support for RxJS operators

### 4. Docker Compose Setup

#### Required Services for Self-Hosted LangSmith

**Core Services:**
- **PostgreSQL**: Primary database
- **Redis**: Pub-sub and caching
- **ClickHouse**: Analytics database
- **LangSmith Backend**: Main application service
- **LangSmith Frontend**: Web interface

**Example Docker Compose Structure:**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: langsmith
      POSTGRES_USER: langsmith
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  langsmith-backend:
    image: langchain/langsmith:latest
    environment:
      - LANGSMITH_LICENSE_KEY=${LANGSMITH_LICENSE_KEY}
      - DATABASE_URL=postgresql://langsmith:${POSTGRES_PASSWORD}@postgres:5432/langsmith
      - REDIS_URL=redis://redis:6379
    ports:
      - "1980:1980"
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

#### Network Configuration
- **Internal Networks**: Services communicate via Docker network
- **External Access**: LangSmith UI exposed on port 1980
- **Database Isolation**: PostgreSQL and Redis on internal network only
- **Egress Requirements**: Allow outbound to `https://beacon.langchain.com`

#### Volume Mounts for Persistence
- **PostgreSQL Data**: `/var/lib/postgresql/data`
- **Redis Data**: `/data`
- **Application Logs**: Configure log volume mounts as needed

#### Environment Variable Configuration

**Production .env Example:**
```bash
# LangSmith Configuration
LANGSMITH_LICENSE_KEY=your-enterprise-license-key
LANGSMITH_API_KEY=your-api-key
LANGSMITH_SECRET_KEY=generated-secret-key

# Database Configuration
POSTGRES_PASSWORD=secure-password
DATABASE_URL=postgresql://langsmith:secure-password@postgres:5432/langsmith

# Redis Configuration
REDIS_URL=redis://redis:6379

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info

# Optional: ClickHouse for Analytics
CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=8123
```

### 5. Production Considerations

#### Security Best Practices for Logging Sensitive Data

**Data Masking Capabilities:**

1. **Complete Hiding:**
```typescript
// Environment variables
LANGSMITH_HIDE_INPUTS=true
LANGSMITH_HIDE_OUTPUTS=true

// Or programmatically
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
  hideInputs: true,
  hideOutputs: true
});
```

2. **Regex-Based Masking:**
```typescript
import { createAnonymizer } from "langsmith/anonymizer";

const anonymizer = createAnonymizer({
  // Mask email addresses
  "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b": "[EMAIL]",
  // Mask phone numbers
  "\\b\\d{3}-\\d{3}-\\d{4}\\b": "[PHONE]",
  // Mask credit cards
  "\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b": "[CREDIT_CARD]"
});
```

3. **Function-Level Processing:**
```typescript
import { traceable } from "langsmith/traceable";

const processInputs = (inputs: any) => {
  // Remove sensitive fields
  const { password, apiKey, ...safe } = inputs;
  return safe;
};

const processOutputs = (outputs: any) => {
  // Remove sensitive response data
  const { internalData, ...safe } = outputs;
  return safe;
};

const myFunction = traceable(
  async (inputs) => {
    // Function logic
    return outputs;
  },
  {
    name: "my-function",
    processInputs,
    processOutputs
  }
);
```

**Important Security Warnings:**
- Masking implementations are not exhaustive and may miss edge cases
- Test thoroughly before production use
- Data ownership: LangSmith will not train on your data
- Self-hosting recommended for environments where data cannot leave premises

#### Performance Impact and Mitigation Strategies

**Performance Optimizations:**
- **Async Processing**: Use `LANGCHAIN_CALLBACKS_BACKGROUND=true` for non-serverless
- **No Application Latency**: Callback handlers run as distributed async processes
- **Lightweight Operations**: Minimize operations in interceptors
- **Non-blocking Logging**: Prevent performance bottlenecks

**Monitoring Recommendations:**
```typescript
// Production monitoring setup
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Global interceptors for monitoring
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new PerformanceInterceptor(),
    new LangChainTracingInterceptor()
  );
  
  // Health checks
  app.enableCors();
  app.setGlobalPrefix('api');
  
  await app.listen(3000);
}
```

#### Monitoring and Observability Recommendations

**Production Observability Stack:**
- **Metrics Collection**: Prometheus integration
- **Log Aggregation**: ELK/EFK stack
- **Distributed Tracing**: Jaeger or Zipkin
- **Health Monitoring**: Regular health checks

**LangSmith Integration:**
```typescript
import { MetricsService } from '@multiversx/sdk-nestjs-monitoring';

const metricsService = app.get<MetricsService>(MetricsService);
const globalInterceptors = [
  new RequestCpuTimeInterceptor(metricsService),
  new LoggingInterceptor(metricsService)
];
app.useGlobalInterceptors(...globalInterceptors);
```

#### Cost Considerations: Cloud vs Self-Hosted

**Cloud Deployment:**
- **Pros**: Managed service, automatic updates, no infrastructure management
- **Cons**: Ongoing subscription costs, data leaves premises
- **Use Cases**: Rapid development, small-medium scale applications

**Self-Hosted Deployment:**
- **Pros**: Full data control, no ongoing subscription after license, customizable
- **Cons**: Enterprise plan required, infrastructure management, maintenance overhead
- **Use Cases**: Large enterprises, regulated industries, high-security requirements

**Resource Planning:**
- Minimum 4 vCPUs, 16GB RAM for basic deployment
- Scale based on trace volume and retention requirements
- Consider storage costs for long-term trace retention

## Key Takeaways

1. **Enterprise Requirement**: Self-hosted LangSmith requires Enterprise Plan licensing
2. **Docker Ready**: Comprehensive Docker Compose setup available
3. **NestJS Compatible**: Strong integration patterns with dependency injection and interceptors
4. **Security Focus**: Built-in data masking and hiding capabilities for production
5. **Performance Optimized**: Async logging prevents application latency
6. **Framework Agnostic**: Works with or without LangChain framework
7. **Production Ready**: Supports SSL, authentication, and monitoring integration

## Gaps Identified

1. **Pricing Information**: Specific costs for Enterprise Plan not publicly available
2. **Migration Guides**: Limited documentation on migrating from other observability platforms
3. **Advanced Configuration**: Some advanced Docker configurations require consultation with LangChain team

## Recommendations for Implementation

1. **Start with Cloud**: Begin development with LangSmith cloud for rapid prototyping
2. **Environment Strategy**: Use separate projects for development/staging/production
3. **Security First**: Implement data masking from the beginning, not as an afterthought
4. **Interceptor Pattern**: Use NestJS interceptors for comprehensive logging integration
5. **Docker Development**: Use Docker Compose for local development to match production
6. **Monitoring Integration**: Plan observability stack integration early in development

## Sources

- LangSmith Official Documentation: https://docs.langchain.com/langsmith
- Docker Compose Production Guide: https://docs.docker.com/compose/production/
- NestJS Interceptors Documentation: https://docs.nestjs.com/interceptors
- LangChain Security Policy: https://python.langchain.com/docs/security/
- LangSmith Data Masking Guide: https://docs.langchain.com/langsmith/mask-inputs-outputs
- Various technical blogs and Stack Overflow discussions for implementation patterns

**Last Updated**: 2025-09-01
**Documentation Version**: LangSmith 2025, LangChain v0.x, NestJS v10.x
**Confidence Level**: High (based on official documentation and established patterns)