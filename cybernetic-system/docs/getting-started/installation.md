# Installation Guide

## 🎯 Prerequisites

Before installing the Cybernetic aMCP Framework, ensure you have the following:

### Required Software

| Software | Version | Installation Guide |
|----------|---------|-------------------|
| **Elixir** | 1.14+ | [Install Elixir](https://elixir-lang.org/install.html) |
| **Erlang/OTP** | 25+ | Included with Elixir |
| **Docker** | 20.10+ | [Install Docker](https://docs.docker.com/get-docker/) |
| **Docker Compose** | 2.0+ | [Install Compose](https://docs.docker.com/compose/install/) |
| **Git** | 2.0+ | [Install Git](https://git-scm.com/downloads) |

### Optional Software

- **PostgreSQL** 14+ (if not using Docker)
- **RabbitMQ** 3.11+ (if not using Docker)
- **Redis** 7+ (if not using Docker)

## 📦 Installation Methods

### Method 1: Quick Start with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/jmanhype/cybernetic-amcp.git
cd cybernetic-amcp

# Copy environment template
cp .env.example .env

# Start all services
docker-compose -f config/docker/docker-compose.yml up -d

# Install Elixir dependencies
mix deps.get

# Run database migrations
mix ecto.setup

# Start the application
iex -S mix
```

### Method 2: Manual Installation

#### Step 1: Install RabbitMQ

```bash
# macOS
brew install rabbitmq
brew services start rabbitmq

# Ubuntu/Debian
sudo apt-get install rabbitmq-server
sudo systemctl start rabbitmq-server

# Enable management plugin
rabbitmq-plugins enable rabbitmq_management
```

#### Step 2: Install PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt-get install postgresql
sudo systemctl start postgresql

# Create database
createdb cybernetic_dev
```

#### Step 3: Install Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server
```

#### Step 4: Setup Application

```bash
# Clone and enter directory
git clone https://github.com/jmanhype/cybernetic-amcp.git
cd cybernetic-amcp

# Install dependencies
mix deps.get
mix deps.compile

# Setup database
mix ecto.create
mix ecto.migrate

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# AI Provider API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
TOGETHER_API_KEY=your_together_key

# RabbitMQ Configuration
AMQP_URL=amqp://guest:guest@localhost:5672

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost/cybernetic_dev

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your_secret_key_here

# Additional Security (required in production)
PASSWORD_SALT=your_password_salt_here
CYBERNETIC_HMAC_SECRET=your_hmac_secret_here
SECRET_KEY_BASE=your_phoenix_secret_key_base_here
CYBERNETIC_SYSTEM_API_KEY=cyb_your_system_api_key_here

# Telemetry Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

### Application Configuration

Edit `config/runtime.exs` for runtime settings:

```elixir
config :cybernetic,
  # AI Provider Settings
  providers: [
    anthropic: [
      model: "claude-3-opus-20240229",
      max_tokens: 4096,
      temperature: 0.7
    ],
    openai: [
      model: "gpt-4-turbo-preview",
      max_tokens: 4096,
      temperature: 0.7
    ]
  ],
  
  # Circuit Breaker Settings
  circuit_breaker: [
    error_threshold: 5,
    timeout: 30_000,
    reset_timeout: 60_000
  ],
  
  # Rate Limiting
  rate_limit: [
    requests_per_minute: 60,
    burst_size: 10
  ]
```

## ✅ Verification

### Check Service Status

```bash
# Verify RabbitMQ
curl -u guest:guest http://localhost:15672/api/overview

# Verify PostgreSQL
psql -U postgres -c "SELECT version();"

# Verify Redis
redis-cli ping
# Should return: PONG

# Verify Application
mix test
# All tests should pass
```

### Run Health Check

```elixir
# In IEx console
Cybernetic.Health.check_all()
# Should return: {:ok, %{status: :healthy, ...}}
```

## 🚀 Next Steps

1. [Configure your AI providers](configuration.md)
2. [Run your first query](first-query.md)
3. [Explore the examples](../examples/basic-usage.md)
4. [Deploy to production](../deployment/production.md)

## 🆘 Troubleshooting

### Common Issues

<details>
<summary>RabbitMQ Connection Error</summary>

```bash
# Check if RabbitMQ is running
sudo systemctl status rabbitmq-server

# Check logs
sudo journalctl -u rabbitmq-server

# Restart RabbitMQ
sudo systemctl restart rabbitmq-server
```
</details>

<details>
<summary>Database Connection Error</summary>

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -U postgres -h localhost

# Reset password if needed
sudo -u postgres psql
ALTER USER postgres PASSWORD 'newpassword';
```
</details>

<details>
<summary>Dependency Compilation Error</summary>

```bash
# Clear build artifacts
mix deps.clean --all
rm -rf _build

# Reinstall dependencies
mix deps.get
mix deps.compile
```
</details>

## 📚 Additional Resources

- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Elixir Mix Documentation](https://hexdocs.pm/mix/Mix.html)
- [RabbitMQ Management](https://www.rabbitmq.com/management.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
