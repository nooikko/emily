#!/bin/bash

echo "🔍 Testing Observability Stack..."

# Check if containers are running
echo "📋 Checking container status..."
docker compose ps --filter "status=running" --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

# Test health endpoints
echo -e "\n🏥 Testing health endpoints..."

# OTel Collector
echo "Testing OTel Collector health..."
curl -s -f http://localhost:13133 > /dev/null && echo "✅ OTel Collector: Healthy" || echo "❌ OTel Collector: Unhealthy"

# Loki
echo "Testing Loki readiness..."
curl -s -f http://localhost:3100/ready > /dev/null && echo "✅ Loki: Ready" || echo "❌ Loki: Not ready"

# Jaeger
echo "Testing Jaeger..."
curl -s -f http://localhost:16686/ > /dev/null && echo "✅ Jaeger: Accessible" || echo "❌ Jaeger: Not accessible"

# Prometheus
echo "Testing Prometheus..."
curl -s -f http://localhost:9090/-/healthy > /dev/null && echo "✅ Prometheus: Healthy" || echo "❌ Prometheus: Unhealthy"

# Grafana
echo "Testing Grafana..."
curl -s -f http://localhost:3001/api/health > /dev/null && echo "✅ Grafana: Healthy" || echo "❌ Grafana: Unhealthy"

echo -e "\n🚀 Observability stack test complete!"
echo "Access URLs:"
echo "  🔍 Grafana: http://localhost:3001 (admin/emily123)"
echo "  📊 Prometheus: http://localhost:9090"
echo "  🔗 Jaeger: http://localhost:16686" 
echo "  📜 Loki: http://localhost:3100"