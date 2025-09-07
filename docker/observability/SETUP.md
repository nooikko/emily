# Emily AI Assistant - Observability Setup (Home Edition)

Simple setup for running Emily AI Assistant with full observability at home.

## Overview

The observability stack includes:
- **OpenTelemetry Collector**: Receives, processes, and exports telemetry data
- **Grafana**: Visualization and dashboards
- **Prometheus**: Metrics collection and storage
- **Loki**: Log aggregation
- **Jaeger**: Distributed tracing
- **Promtail**: Log collection agent

## Quick Start

1. **Start the observability stack:**
   ```bash
   ./scripts/start-observability.sh
   ```

2. **Test the stack:**
   ```bash
   ./scripts/test-observability.sh
   ```

3. **Access dashboards:**
   - Grafana: http://localhost:3001 (admin/emily123)
   - Prometheus: http://localhost:9090
   - Jaeger: http://localhost:16686
   - Loki: http://localhost:3100

## Configuration

### Environment Variables

Copy `.env.example` to `.env` - the defaults work great for home use:

```bash
# Everything you need for home setup
OTEL_SERVICE_NAME=emily-ai-assistant
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_LOG_LEVEL=INFO
```

That's it! No complex configuration needed for home use.

## Architecture

```
[Emily App] 
    ↓ (OTLP)
[OTel Collector]
    ├── Traces → [Jaeger]
    ├── Metrics → [Prometheus]
    └── Logs → [Loki]
              ↑
         [Promtail] (Docker logs)

[Grafana] ← [Prometheus, Loki, Jaeger]
```

## Troubleshooting

### Common Issues

1. **OTel Collector not receiving data:**
   - Check endpoint: `curl http://localhost:13133` (health check)
   - Verify app config: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

2. **Logs not appearing in Loki:**
   - Check Loki: `curl http://localhost:3100/ready`
   - Verify OTel pipeline includes Loki exporter

3. **Grafana dashboards empty:**
   - Check datasource connections in Grafana
   - Verify services are generating data

### Container Health Checks

```bash
# Check all containers
docker compose ps

# Check specific service logs
docker compose logs otel-collector
docker compose logs loki
docker compose logs grafana
```

### Port Mappings

| Service | Port | Purpose |
|---------|------|---------|
| OTel Collector | 4318 | OTLP HTTP |
| OTel Collector | 4317 | OTLP gRPC |
| OTel Collector | 13133 | Health check |
| Grafana | 3001 | Web UI |
| Prometheus | 9090 | Web UI |
| Jaeger | 16686 | Web UI |
| Loki | 3100 | API |

## Customization

### Adding Custom Metrics

1. Update `prometheus.yml` to add scrape targets
2. Create custom Grafana dashboards in `grafana/dashboards/`
3. Update OTel collector config for custom processors

### Custom Log Processing

1. Modify `otel-collector-config.yml` processors section
2. Add custom attributes or filtering
3. Configure Loki labels for better organization

### External Integrations

To send data to external systems:

1. Update `.env` with external endpoints:
   ```bash
   EXTERNAL_OTLP_ENDPOINT=https://your-external-collector
   EXTERNAL_API_KEY=your-api-key
   ```

2. Enable external exporter in OTel collector config

## Monitoring Best Practices

1. **Alerts**: Set up alerts for critical metrics in Grafana
2. **Retention**: Configure appropriate retention periods
3. **Sampling**: Adjust trace sampling for production traffic
4. **Security**: Use proper authentication for production deployments

## Support

For issues with the observability stack:
1. Check container logs: `docker compose logs [service]`
2. Verify network connectivity between services
3. Review configuration files for syntax errors
4. Test with minimal configuration first