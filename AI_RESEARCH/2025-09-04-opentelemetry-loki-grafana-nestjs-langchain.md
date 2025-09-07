# Research: OpenTelemetry, Loki, and Grafana Implementation for NestJS with LangChain
Date: 2025-09-04
Requested by: User

## Summary
Comprehensive research on implementing observability stack (OpenTelemetry, Loki, Grafana) for NestJS applications with LangChain integration. Covers setup, configuration, best practices, and specific implementation patterns for AI assistant monitoring.

## Prior Research
No existing research found in AI_RESEARCH for this specific technology stack combination.

## Current Findings

### 1. OpenTelemetry for NestJS

#### Required Dependencies
```bash
npm install --save @opentelemetry/api@latest
npm install --save @opentelemetry/sdk-node@latest
npm install --save @opentelemetry/auto-instrumentations-node@^0.62.0
npm install --save @opentelemetry/exporter-trace-otlp-http@latest
npm install --save @opentelemetry/sdk-trace-base@latest
```

#### Critical Initialization Pattern
OpenTelemetry MUST be initialized before any application code:

```typescript
// tracer.ts - THIS MUST BE THE FIRST IMPORT
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: {
      'signoz-ingestion-key': process.env.SIGNOZ_INGESTION_KEY
    }
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false }
    })
  ]
});

export default sdk;
```

```typescript
// main.ts - Import tracer first
import tracer from './tracer';

async function bootstrap() {
  // Start tracer immediately before creating the app
  await tracer.start();
  
  const app = await NestFactory.create(AppModule);
  // Rest of bootstrap logic
}
```

#### Custom Instrumentation Decorator
```typescript
import { trace } from '@opentelemetry/api';

export function Traced(spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const tracer = trace.getTracer('nestjs-app', '1.0.0');
    
    descriptor.value = async function (...args: any[]) {
      return await tracer.startActiveSpan(
        spanName || `${target.constructor.name}.${propertyKey}`,
        async (span) => {
          try {
            const result = await originalMethod.apply(this, args);
            span.setStatus({ code: trace.SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.setStatus({ 
              code: trace.SpanStatusCode.ERROR, 
              message: error.message 
            });
            throw error;
          } finally {
            span.end();
          }
        }
      );
    };
  };
}
```

#### Best Practices for NestJS Integration
- **Initialization Order**: OpenTelemetry must be loaded before NestJS modules
- **Auto-instrumentation**: Automatically instruments Express, HTTP, gRPC, GraphQL
- **Context Propagation**: Automatically handles trace context across async operations
- **Logger Integration**: Use OpenTelemetry's logging bridge or structured logging with trace IDs

### 2. LangChain Tracing Integration

#### LangSmith OpenTelemetry Support (2024)
LangSmith now provides native OpenTelemetry support with automatic instrumentation for LangChain applications.

#### Environment Configuration
```bash
# LangSmith OpenTelemetry Integration
LANGSMITH_OTEL_ENABLED=true
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=your_api_key
```

#### Implementation Patterns
```typescript
// Automatic LangChain instrumentation
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const prompt = ChatPromptTemplate.fromTemplate("Tell me about {topic}");
const model = new ChatOpenAI();
const chain = prompt.pipe(model);

// This will automatically generate OpenTelemetry traces
const result = await chain.invoke({ topic: "AI observability" });
```

#### Custom LangChain Instrumentation
```typescript
import { trace } from '@opentelemetry/api';

export class AIService {
  private tracer = trace.getTracer('ai-service', '1.0.0');

  @Traced('langchain-conversation')
  async processConversation(input: string): Promise<string> {
    return await this.tracer.startActiveSpan('langchain-processing', async (span) => {
      span.setAttributes({
        'ai.operation.name': 'chat_completion',
        'ai.request.model': 'gpt-4',
        'ai.request.temperature': 0.7,
        'ai.request.max_tokens': 1000,
      });

      const result = await this.chain.invoke({ input });
      
      span.setAttributes({
        'ai.response.tokens.prompt': result.usage?.promptTokens || 0,
        'ai.response.tokens.completion': result.usage?.completionTokens || 0,
        'ai.response.cost': calculateCost(result.usage),
      });

      return result.content;
    });
  }
}
```

### 3. Loki Setup and Configuration

#### Docker Compose Configuration
```yaml
version: '3.8'
services:
  loki:
    image: grafana/loki:3.4.1
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki-data:/loki
    networks:
      - observability

  promtail:
    image: grafana/promtail:3.4.1
    volumes:
      - ./promtail-config.yaml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/config.yml
    depends_on:
      - loki
    networks:
      - observability

volumes:
  loki-data:

networks:
  observability:
```

#### Loki Configuration (loki-config.yaml)
```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_scheduler:
  max_outstanding_requests_per_tenant: 32768

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

analytics:
  reporting_enabled: false
```

#### Promtail vs Direct Application Logging

**Promtail Approach (Recommended for Development)**
- Collects logs from files and Docker containers
- Service discovery for dynamic environments
- Log parsing and relabeling capabilities
- Better for multi-service architectures

**Direct Application Logging**
```typescript
// NestJS Winston + Loki Transport
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

const logger = WinstonModule.createLogger({
  transports: [
    new LokiTransport({
      host: process.env.LOKI_URL || 'http://localhost:3100',
      labels: { app: 'emily-ai', environment: process.env.NODE_ENV },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: (err) => console.error(err),
    }),
  ],
});
```

#### Log Format Recommendations
- **JSON Format**: Better for structured querying and parsing
- **Label Strategy**: Use consistent labels (app, environment, service, level)
- **Trace Correlation**: Include trace IDs in log entries

```typescript
// Structured logging with trace correlation
import { trace } from '@opentelemetry/api';

class LoggerService {
  log(level: string, message: string, meta: object = {}) {
    const span = trace.getActiveSpan();
    const traceId = span?.spanContext().traceId;
    const spanId = span?.spanContext().spanId;

    this.logger.log(level, message, {
      ...meta,
      traceId,
      spanId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 4. Grafana Configuration and Dashboards

#### Essential Data Sources Configuration
```yaml
# grafana/provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
```

#### AI Assistant Monitoring Dashboard Configuration
Key panels for Emily AI assistant:

1. **Conversation Metrics Panel**
```json
{
  "title": "Conversation Volume",
  "type": "stat",
  "targets": [
    {
      "expr": "rate(conversation_requests_total[5m])",
      "legendFormat": "Requests/sec"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "palette-classic" },
      "custom": { "displayMode": "basic" }
    }
  }
}
```

2. **LangChain Performance Panel**
```json
{
  "title": "LLM Response Times",
  "type": "timeseries",
  "targets": [
    {
      "expr": "histogram_quantile(0.95, rate(langchain_request_duration_seconds_bucket[5m]))",
      "legendFormat": "95th percentile"
    }
  ]
}
```

3. **Token Usage and Cost Panel**
```json
{
  "title": "Token Consumption",
  "type": "timeseries",
  "targets": [
    {
      "expr": "rate(langchain_tokens_total[5m]) by (model, type)",
      "legendFormat": "{{model}} - {{type}}"
    }
  ]
}
```

#### Trace to Logs Correlation
Configure Grafana to correlate traces with logs:

```yaml
# In Tempo datasource configuration
tracesToLogs:
  datasourceUid: 'loki-uid'
  tags: ['traceId']
  mappedTags: [
    { key: 'service.name', value: 'service' }
  ]
  mapTagNamesEnabled: true
  spanStartTimeShift: '-1h'
  spanEndTimeShift: '1h'
```

#### Alert Rules for AI Assistant
```yaml
groups:
  - name: emily-ai-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowLLMResponses
        expr: histogram_quantile(0.95, rate(langchain_request_duration_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "LLM responses are taking too long"
          
      - alert: TokenBudgetExceeded
        expr: increase(langchain_tokens_total[1h]) > 100000
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "Token usage budget exceeded"
```

### 5. Implementation Architecture

#### Service Initialization Order
1. **OpenTelemetry SDK** (first, before any imports)
2. **Logging infrastructure** (with trace correlation)
3. **NestJS application** (with auto-instrumentation active)
4. **LangChain services** (with OpenTelemetry integration)
5. **Health checks and metrics endpoints**

#### Environment Variable Configuration
```bash
# OpenTelemetry
OTEL_SERVICE_NAME=emily-ai
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs

# LangSmith Integration
LANGSMITH_OTEL_ENABLED=true
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_api_key

# Loki
LOKI_URL=http://localhost:3100

# Development vs Production
NODE_ENV=development
LOG_LEVEL=debug
```

#### Development vs Production Considerations

**Development Setup:**
- Enable debug logging
- Use console exporters for immediate feedback
- Shorter retention policies
- Higher sampling rates

**Production Setup:**
- Structured JSON logging only
- OTLP exporters to dedicated backends
- Longer retention policies (30-90 days)
- Optimized sampling rates (1-5%)
- Resource limits and monitoring

#### Performance Overhead Considerations
- **Auto-instrumentation overhead**: ~2-5% CPU increase
- **Manual spans**: Minimal overhead when used judiciously
- **Sampling strategies**: Use head-based sampling for cost control
- **Batch processing**: Configure batch span processors for efficiency

```typescript
// Optimized span processor configuration
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const spanProcessor = new BatchSpanProcessor(
  new OTLPTraceExporter(),
  {
    maxExportBatchSize: 512,
    maxQueueSize: 2048,
    scheduledDelayMillis: 5000,
    exportTimeoutMillis: 30000,
  }
);
```

#### Data Retention Policies
- **Traces**: 7-30 days (high volume, short-term debugging)
- **Metrics**: 90 days-1 year (trends and capacity planning)
- **Logs**: 30-90 days (compliance and debugging)
- **Long-term metrics**: Downsampled aggregates for historical analysis

## Key Takeaways

1. **Initialization Order Critical**: OpenTelemetry must be initialized before NestJS application code
2. **LangSmith Integration**: Native OpenTelemetry support available in 2024 for seamless LangChain tracing
3. **Structured Logging**: JSON format with trace correlation provides best querying capabilities
4. **Performance Impact**: Minimal with proper configuration (~2-5% overhead)
5. **Dashboard Focus**: Monitor conversation volume, response times, token usage, and error rates
6. **Alert Strategy**: Focus on user experience (response times) and cost control (token usage)

## Sources

- OpenTelemetry Node.js Documentation: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- OpenTelemetry JavaScript Instrumentation: https://opentelemetry.io/docs/languages/js/instrumentation/
- SigNoz OpenTelemetry NestJS Guide: https://signoz.io/blog/opentelemetry-nestjs/
- LangSmith OpenTelemetry Integration: https://docs.smith.langchain.com/observability/how_to_guides/trace_with_opentelemetry
- Grafana Loki Docker Setup: https://grafana.com/docs/loki/latest/setup/install/docker/
- Grafana LLM Observability Guide (2024): https://grafana.com/blog/2024/07/18/a-complete-guide-to-llm-observability-with-opentelemetry-and-grafana-cloud/
- LangChain Observability Dashboard: https://grafana.com/grafana/dashboards/19623-langchain-observability-dashboard/