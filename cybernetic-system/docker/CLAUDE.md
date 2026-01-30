# Docker Directory

## Purpose
Docker configuration and container definitions for all services.

## Structure
- `Dockerfile` - Main application container
- `config/` - Docker-specific configurations
- `grafana/` - Grafana dashboards and provisioning
- `otel/` - OpenTelemetry collector config
- `postgres/` - PostgreSQL initialization scripts
- `prometheus/` - Prometheus configuration
- `rabbitmq/` - RabbitMQ configuration

## Services
- **RabbitMQ**: Message broker (port 5672, management 15672)
- **PostgreSQL**: Database (port 5432)
- **Prometheus**: Metrics collection (port 9090)
- **Grafana**: Metrics visualization (port 3000)
- **Jaeger**: Distributed tracing (port 16686)

## Quick Start
```bash
docker-compose -f config/docker/docker-compose.yml up -d
```

## Ports
- 5672: RabbitMQ AMQP
- 15672: RabbitMQ Management
- 5432: PostgreSQL
- 9090: Prometheus
- 3000: Grafana
- 16686: Jaeger UI