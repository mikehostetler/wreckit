# Staging Deployment Instructions

## Prerequisites
- Docker and Docker Compose installed
- At least 4GB RAM available for containers

## Quick Start

```bash
# 1. Start the observability stack
docker compose up -d

# 2. Verify all services are healthy
docker compose ps

# 3. Access the UIs
# Jaeger:      http://localhost:16686
# Grafana:     http://localhost:3000 (admin/cybernetic_dev)
# Prometheus:  http://localhost:9090  
# RabbitMQ:    http://localhost:15672 (cybernetic/dev_password)
# OTEL Health: http://localhost:13133

# 4. Deploy Cybernetic app (when ready)
# Set environment variables and run with MIX_ENV=prod
```

## Verification Steps

1. **OTEL Collector**: Check health at `http://localhost:13133`
2. **Jaeger**: Verify trace collection UI is accessible
3. **RabbitMQ**: Confirm AMQP connectivity
4. **Prometheus**: Check metrics scraping
5. **Grafana**: Verify datasource connectivity

## Next: Deploy Cybernetic App
The infrastructure is ready. Deploy your Cybernetic application with the environment variables documented in `OTEL_STAGING_GUIDE.md`.