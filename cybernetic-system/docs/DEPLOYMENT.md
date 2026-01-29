# Cybernetic VSM Framework - Deployment Guide

## Quick Start

### Local Development
```bash
# Setup environment
make setup
# Edit .env with your configuration

# Start all services
make up

# Run tests
make test

# View logs
make logs
```

### Production Deployment

## Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Kubernetes 1.28+ (for K8s deployment)
- Elixir 1.18.4 & OTP 28 (for local development)

## Configuration

### Environment Variables
Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `AMQP_URL` - RabbitMQ connection string
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SECRET_KEY_BASE` - Phoenix secret key
- `CYBERNETIC_HMAC_SECRET` - HMAC secret for security
- `JWT_SECRET` - Token signing secret (min 32 chars)
- `PASSWORD_SALT` - Password hashing salt (min 16 chars)

Recommended:
- `CYBERNETIC_SYSTEM_API_KEY` - Edge Gateway `x-api-key` authentication (system access)

Optional AI providers:
- `ANTHROPIC_API_KEY` - For Claude AI
- `OPENAI_API_KEY` - For GPT models
- `TOGETHER_API_KEY` - For open-source models
- `OLLAMA_ENDPOINT` - For local AI (default: http://ollama:11434)

## Deployment Options

### 1. Docker Compose (Recommended for Testing)

```bash
# Build and start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f cybernetic

# Stop services
docker-compose down
```

Access points:
- Application: http://localhost:4000
- RabbitMQ Management: http://localhost:15672
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090

### 2. Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace cybernetic

# Create secrets
kubectl create secret generic cybernetic-secrets \
  --from-literal=release-cookie=$(openssl rand -hex 32) \
  --from-literal=amqp-url="amqp://user:pass@rabbitmq:5672" \
  --from-literal=database-url="postgres://user:pass@postgres:5432/cybernetic" \
  --from-literal=redis-url="redis://default:pass@redis:6379" \
  -n cybernetic

# Deploy application
kubectl apply -f k8s/base/

# Check deployment
kubectl get all -n cybernetic

# View logs
kubectl logs -n cybernetic -l app=cybernetic -f
```

### 3. Standalone Docker

```bash
# Build image
docker build -t cybernetic:latest .

# Run container
docker run -d \
  --name cybernetic \
  -p 4000:4000 \
  --env-file .env \
  cybernetic:latest

# Check logs
docker logs -f cybernetic
```

## CI/CD Pipeline

### GitHub Actions
The repository includes a complete CI/CD pipeline that:

1. **Test Stage**: Runs tests, formatting, and security checks
2. **Build Stage**: Builds multi-arch Docker images
3. **Integration Stage**: Runs integration tests
4. **Deploy Stage**: Deploys to staging/production

### Manual Deployment

```bash
# Deploy to staging
make cd-staging

# Deploy to production (requires confirmation)
make cd-production
```

## Monitoring & Observability

### Grafana Dashboards
1. Navigate to http://localhost:3000
2. Login with admin/changeme (change in production!)
3. Import dashboards from `docker/grafana/dashboards/`

### Metrics Endpoints
- Prometheus metrics: http://localhost:9568/metrics
- Health check: http://localhost:4000/health
- OpenTelemetry: http://localhost:8888/metrics

### Logging
Logs are structured JSON and include:
- Request IDs for tracing
- OpenTelemetry trace/span IDs
- VSM system context
- Performance metrics

## Scaling

### Horizontal Scaling
```yaml
# Increase replicas in k8s/base/deployment.yaml
spec:
  replicas: 5  # Adjust as needed
```

### Resource Limits
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"    # Adjust based on workload
    cpu: "2000m"      # Adjust based on workload
```

## Security Considerations

### Production Checklist
- [ ] Change all default passwords
- [ ] Rotate secrets and API keys
- [ ] Enable TLS/SSL for all connections
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Set up backup strategy
- [ ] Configure rate limiting
- [ ] Enable HMAC message signing
- [ ] Review RBAC permissions

### Secret Management
```bash
# Generate secure secrets
openssl rand -hex 32  # For SECRET_KEY_BASE
openssl rand -hex 32  # For CYBERNETIC_HMAC_SECRET
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 16  # For PASSWORD_SALT
openssl rand -hex 32  # For CYBERNETIC_SYSTEM_API_KEY (optionally prefix with cyb_)
openssl rand -hex 16  # For RELEASE_COOKIE
```

## Backup & Recovery

### Database Backup
```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U cybernetic cybernetic > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U cybernetic cybernetic < backup.sql
```

### RabbitMQ Backup
```bash
# Export definitions
docker-compose exec rabbitmq rabbitmqctl export_definitions /tmp/definitions.json
docker cp cyb-rabbitmq:/tmp/definitions.json ./rabbitmq-backup.json

# Import definitions
docker cp ./rabbitmq-backup.json cyb-rabbitmq:/tmp/definitions.json
docker-compose exec rabbitmq rabbitmqctl import_definitions /tmp/definitions.json
```

## Troubleshooting

### Common Issues

#### RabbitMQ Connection Failed
```bash
# Check RabbitMQ status
docker-compose exec rabbitmq rabbitmqctl status

# Check connectivity
mix run test_amqp.exs
```

#### Database Migration Issues
```bash
# Run migrations manually
docker-compose exec cybernetic mix ecto.migrate
```

#### Memory Issues
```bash
# Check memory usage
docker stats

# Increase memory limits in docker-compose.yml
```

#### Ollama Not Responding
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Pull models
docker-compose exec ollama ollama pull llama2
```

### Debug Mode
```bash
# Enable debug logging
export CYBERNETIC_LOG_LEVEL=debug
docker-compose up
```

### Health Checks
```bash
# Application health
curl http://localhost:4000/health

# RabbitMQ health
curl -u guest:guest http://localhost:15672/api/health/checks/virtual-hosts

# Redis health
docker-compose exec redis redis-cli ping
```

## Performance Tuning

### RabbitMQ
- Adjust `vm_memory_high_watermark` in rabbitmq.conf
- Configure queue TTLs and limits
- Enable lazy queues for large messages

### PostgreSQL
- Tune `shared_buffers` and `work_mem`
- Configure connection pooling
- Add appropriate indexes

### Application
- Adjust `POOL_SIZE` for database connections
- Configure `CYBERNETIC_WORKER_COUNT` for parallelism
- Tune garbage collection with `ERL_FULLSWEEP_AFTER`

## Support

For issues and questions:
- Check `CLAUDE.md` files in each directory
- Review test files for usage examples
- Open an issue on GitHub
- Check logs with `make logs`

## License

See LICENSE file for details.
