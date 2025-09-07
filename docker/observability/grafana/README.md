# Grafana Configuration for Emily AI Assistant

This directory contains the automated provisioning configuration for Grafana, providing instant observability when you deploy the stack.

## 🚀 Quick Start

Grafana is automatically configured when you run:
```bash
docker-compose up -d
```

Access Grafana at: http://localhost:3001
- Username: `admin`
- Password: `emily123`

## 📊 Pre-Configured Dashboards

### 1. **NestJS Application Health** (`nestjs-health`)
Monitor the core application health metrics:
- Application up/down status
- CPU usage over time
- Memory consumption
- HTTP request rates
- Response time percentiles (p50, p95)
- Application uptime

### 2. **Service Dependencies & Health** (`service-dependencies`)
Track all service dependencies:
- PostgreSQL status
- Redis status
- Qdrant vector database status
- Overall system health
- Recent application errors & warnings
- Database statistics
- Distributed traces

### 3. **Emily AI Overview** (`emily-ai-overview`)
High-level system overview dashboard

## 🔌 Configured Data Sources

All data sources are automatically provisioned:

1. **Prometheus** (Default)
   - Metrics collection
   - Application performance monitoring
   - System resource tracking

2. **Loki**
   - Log aggregation
   - Error tracking
   - Application log analysis

3. **Jaeger**
   - Distributed tracing
   - Request flow visualization
   - Performance bottleneck identification

4. **PostgreSQL**
   - Direct database monitoring
   - Query performance analysis
   - Database statistics

## 📁 Directory Structure

```
docker/observability/grafana/
├── provisioning/
│   ├── dashboards/
│   │   └── dashboards.yml      # Dashboard provisioning config
│   └── datasources/
│       └── datasources.yml      # Data source configurations
├── dashboards/
│   ├── nestjs-health.json      # Application health monitoring
│   ├── service-dependencies.json # Service dependency tracking
│   └── emily-ai-overview.json  # System overview
└── README.md                    # This file
```

## 🔧 Customization

### Adding New Dashboards
1. Create your dashboard JSON file in `dashboards/`
2. Restart Grafana: `docker restart emily-grafana`
3. Dashboard will be automatically imported

### Modifying Data Sources
1. Edit `provisioning/datasources/datasources.yml`
2. Restart Grafana to apply changes

### Dashboard UIDs
- `nestjs-health` - NestJS Application Health
- `service-dependencies` - Service Dependencies & Health
- `emily-ai-overview` - Emily AI Overview

## 🎯 Key Metrics Tracked

### Application Metrics
- HTTP request rates and latencies
- Error rates by endpoint
- CPU and memory usage
- Heap size and garbage collection
- Active connections

### Service Health
- Service availability (up/down)
- Connection pool statistics
- Response times
- Error logs and warnings

### Database Metrics
- Connection count
- Database sizes
- Query performance
- Table statistics

## 🚨 Alerts (To Be Configured)

Future enhancement: Add alerting rules for:
- Service downtime
- High error rates
- Memory leaks
- Slow response times
- Database connection issues

## 📝 Notes

- All dashboards auto-refresh every 10 seconds
- Historical data retention depends on Prometheus configuration
- Dashboards are editable but changes won't persist unless saved to JSON files
- To make permanent changes, export from Grafana UI and update the JSON files

## 🔗 Access Links

- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

## 🐛 Troubleshooting

If dashboards don't appear:
1. Check Grafana logs: `docker logs emily-grafana`
2. Verify file permissions on provisioning directories
3. Ensure JSON files are valid
4. Restart Grafana: `docker restart emily-grafana`

If data sources show as unavailable:
1. Verify services are running: `docker ps`
2. Check network connectivity between containers
3. Review datasource URLs in `datasources.yml`