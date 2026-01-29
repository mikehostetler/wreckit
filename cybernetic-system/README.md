# Cybernetic aMCP Framework

A distributed AI orchestration system implementing the Viable System Model (VSM) for intelligent multi-agent coordination.

## 🚀 Quick Start

```bash
# Install dependencies
mix deps.get

# Start services
docker-compose -f config/docker/docker-compose.yml up -d

# Run the system
iex -S mix
```

## 🏗️ Architecture

This system implements Stafford Beer's Viable System Model with 5 hierarchical layers:

- **System 1**: Operations - Handle day-to-day tasks
- **System 2**: Coordination - Balance workload and prevent conflicts  
- **System 3**: Control - Resource management and optimization
- **System 4**: Intelligence - Environmental scanning and AI routing
- **System 5**: Policy - Strategic direction and governance

## 🤖 AI Providers

Integrated support for multiple AI providers with automatic failover:
- Anthropic Claude
- OpenAI GPT
- Together AI
- Ollama (local)

## 📁 Project Structure

```
.
├── config/           # Configuration files
├── docker/           # Docker configurations
├── docs/             # Documentation
├── infrastructure/   # K8s and deployment configs
├── lib/              # Core application code
├── scripts/          # Utility scripts
├── test/             # Test suites
└── tools/            # Development tools
```

## 📚 Documentation

- [Setup Guide](docs/README_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [API Documentation](docs/api/)
- [Architecture Overview](docs/architecture/)

## 🔧 Key Features

- **Fault Tolerance**: Circuit breakers and automatic failover
- **Distributed State**: CRDT-based state synchronization
- **Message Queue**: AMQP/RabbitMQ for reliable communication
- **Observability**: OpenTelemetry, Prometheus, Grafana
- **MCP Tools**: Database, code analysis, financial calculations

## 🧪 Testing

```bash
# Run tests
mix test

# Validate system
mix run scripts/prove/prove_entire_system.exs
```

## 🚢 Deployment

See [infrastructure/README.md](infrastructure/README.md) for deployment options:
- Local (Docker Compose)
- Kubernetes
- Cloud providers

## 📝 License

MIT License - See LICENSE file for details
