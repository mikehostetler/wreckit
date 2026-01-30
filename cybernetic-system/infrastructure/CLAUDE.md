# Infrastructure Directory

## Purpose
Infrastructure as Code (IaC) and deployment configurations.

## Structure
- `k8s/` - Kubernetes manifests and configurations
  - `deployments/` - Deployment specifications
  - `services/` - Service definitions
  - `configmaps/` - Configuration maps
  - `secrets/` - Secret templates

## Deployment Targets
- **Local**: Docker Compose (see docker/)
- **Kubernetes**: K8s manifests for cloud deployment
- **Cloud**: AWS/GCP/Azure specific configs

## Key Files
- Deployment manifests for VSM systems
- Service mesh configurations
- Ingress rules
- Persistent volume claims

## Deployment Commands
```bash
# Deploy to Kubernetes
kubectl apply -f infrastructure/k8s/

# Check deployment status
kubectl get pods -n cybernetic
```

## Environment Management
- Development: Local Docker
- Staging: K8s staging cluster
- Production: K8s production cluster