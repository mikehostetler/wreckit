# Infrastructure Directory

Infrastructure as Code (IaC) and deployment configurations for the Cybernetic aMCP Framework.

## 🏗️ Overview

This directory contains all infrastructure definitions for deploying the system across different environments.

## 📁 Structure

```
infrastructure/
└── k8s/                    # Kubernetes manifests
    ├── deployments/        # Deployment specifications
    ├── services/           # Service definitions
    ├── configmaps/         # Configuration maps
    └── secrets/            # Secret templates
```

## 🚀 Deployment Environments

### Local Development
Use Docker Compose for local deployment:
```bash
docker-compose -f config/docker/docker-compose.yml up -d
```

### Kubernetes Deployment
Deploy to a Kubernetes cluster:
```bash
# Apply all manifests
kubectl apply -f infrastructure/k8s/

# Or deploy specific components
kubectl apply -f infrastructure/k8s/deployments/
kubectl apply -f infrastructure/k8s/services/
```

## 📋 Components

### Core Services
- **RabbitMQ**: Message broker deployment
- **PostgreSQL**: Database deployment
- **Redis**: Cache layer deployment

### VSM Systems
- **System1-5**: Deployments for each VSM layer
- Service definitions for inter-system communication
- ConfigMaps for system configuration

### Monitoring Stack
- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **Jaeger**: Distributed tracing

## 🔧 Configuration

### ConfigMaps
- Application configuration
- Environment-specific settings
- Feature flags

### Secrets
- API keys (Anthropic, OpenAI, etc.)
- Database credentials
- JWT secrets

## 📊 Scaling

### Horizontal Pod Autoscaling
```yaml
kubectl autoscale deployment vsm-system1 --cpu-percent=80 --min=2 --max=10
```

### Resource Limits
Each deployment includes resource requests and limits for optimal cluster utilization.

## 🔐 Security

- Network policies for service isolation
- RBAC configurations
- Secret management via Kubernetes Secrets

## 📝 Best Practices

1. **Environment Separation**: Use namespaces for different environments
2. **Version Control**: Tag all images with specific versions
3. **Health Checks**: Configure liveness and readiness probes
4. **Resource Management**: Set appropriate resource requests/limits
5. **Configuration**: Use ConfigMaps and Secrets for configuration

## 🛠️ Maintenance

### Update Deployments
```bash
kubectl set image deployment/vsm-system1 app=cybernetic:v2.0.0
```

### Monitor Resources
```bash
kubectl top nodes
kubectl top pods
```

### View Logs
```bash
kubectl logs -f deployment/vsm-system1
```