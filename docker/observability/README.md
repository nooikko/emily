# Emily AI Assistant - Observability Stack

This directory contains the complete observability infrastructure for the Emily AI assistant, providing comprehensive monitoring, logging, and tracing capabilities.

## Architecture

The observability stack consists of:

- **OpenTelemetry Collector**: Receives, processes, and exports telemetry data
- **Jaeger**: Distributed tracing storage and UI
- **Loki**: Log aggregation and storage
- **Promtail**: Log collection agent
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards

## Quick Start

1. **Start the observability stack**:
   ```bash
   pnpm observability:up
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.observability.example .env.observability
   source .env.observability
   ```

3. **Start Emily with observability**:
   ```bash
   pnpm start:dev
   ```

4. **Access the dashboards**:
   - Grafana: http://localhost:3000 (admin/emily123)
   - Jaeger: http://localhost:16686
   - Prometheus: http://localhost:9090
   - Loki: http://localhost:3100

## Features

### Comprehensive Tracing
- **LangChain Operations**: Automatic tracing of chains, agents, and tools
- **Memory Operations**: Semantic and checkpointer memory tracing
- **HTTP Requests**: Automatic instrumentation of incoming/outgoing requests
- **Database Operations**: PostgreSQL and Redis query tracing

### Advanced Metrics
- **AI Metrics**: Token consumption, model performance, conversation metrics
- **Memory Metrics**: Hit rates, retrieval latency, storage performance
- **System Metrics**: Response times, error rates, resource usage
- **Business Metrics**: User satisfaction, personality consistency

### Structured Logging
- **Trace Correlation**: Automatic correlation of logs with traces
- **Contextual Metadata**: Thread ID, user ID, operation context
- **Error Tracking**: Structured error information with stack traces
- **Performance Logging**: Duration and performance metrics

## Configuration

### Environment Variables

Key configuration options:

```bash
# Service identification
OTEL_SERVICE_NAME=emily-ai-assistant
OTEL_SERVICE_VERSION=1.0.0

# OTLP endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Sampling rates (0.0-1.0)
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_METRICS_SAMPLER_ARG=1.0

# Feature toggles
OTEL_LOGS_STRUCTURED_ENABLED=true
OTEL_LOGS_TRACE_CORRELATION_ENABLED=true
```

### Instrumentation

The observability stack automatically instruments:

- **HTTP requests** (Express, NestJS)
- **Database queries** (PostgreSQL, Redis)
- **LangChain operations** (custom instrumentation)
- **Memory operations** (semantic and checkpointer)

## Usage

### Decorators

Use observability decorators in your code:

```typescript
import { TraceAI, MetricAI } from './observability';

@TraceAI({ operation: 'chain_invoke', modelProvider: 'anthropic' })
@MetricAI({ measureDuration: true, trackSuccessRate: true })
async invokeChain(input: string): Promise<string> {
  // Your implementation
}
```

### Manual Instrumentation

For custom metrics and tracing:

```typescript
import { MetricsCollector, addSpanAttribute } from './observability';

// Record custom metrics
MetricsCollector.recordTokenConsumption(150, {
  model_provider: 'anthropic',
  operation: 'completion'
});

// Add span attributes
addSpanAttribute('user.id', userId);
addSpanAttribute('conversation.length', messageCount);
```

### Structured Logging

Use the structured logger for contextual logging:

```typescript
import { StructuredLoggerService } from './observability';

const logger = new StructuredLoggerService('MyService');

logger.logAIOperation('chain_invoke', 1250, true, {
  model: 'claude-3-sonnet',
  tokens: 150
});

logger.logConversation('started', threadId, 1);
```

## Dashboards

### Emily AI Overview
- Active conversations
- Response time percentiles
- Token consumption
- Memory hit rates
- Error rates

### LangChain Operations
- Chain execution metrics
- Tool usage statistics
- Model performance
- Token costs

### Memory System
- Retrieval performance
- Storage statistics
- Hit/miss rates
- Query latencies

### System Health
- Service uptime
- Resource utilization
- Error tracking
- Performance trends

## Troubleshooting

### Common Issues

1. **OTLP Connection Issues**:
   - Verify collector is running: `docker ps | grep emily-otel`
   - Check endpoint configuration: `OTEL_EXPORTER_OTLP_ENDPOINT`

2. **Missing Traces**:
   - Check sampling rate: `OTEL_TRACES_SAMPLER_ARG`
   - Verify instrumentation is enabled

3. **Log Correlation Issues**:
   - Ensure trace correlation is enabled: `OTEL_LOGS_TRACE_CORRELATION_ENABLED=true`
   - Check structured logging: `OTEL_LOGS_STRUCTURED_ENABLED=true`

### Logs

View component logs:

```bash
# All observability logs
pnpm observability:logs

# Specific service logs
docker-compose -f docker/observability/docker-compose.observability.yml logs otel-collector
docker-compose -f docker/observability/docker-compose.observability.yml logs grafana
```

## Performance Impact

The observability stack is designed with minimal performance impact:

- **Sampling**: Configurable sampling rates to control overhead
- **Async Processing**: Non-blocking telemetry export
- **Batching**: Efficient batching of traces and metrics
- **Resource Limits**: Memory limits prevent resource exhaustion

## Security

- **No Sensitive Data**: Automatic filtering of authorization headers
- **Local Storage**: All data stored locally by default
- **Access Control**: Grafana authentication enabled
- **Network Isolation**: Services communicate within Docker network