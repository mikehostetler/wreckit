# Config Directory - Application Configuration

## Files
- `config.exs` - Base configuration loaded for all environments
- `dev.exs` - Development environment configuration
- `test.exs` - Test environment configuration  
- `prod.exs` - Production environment configuration
- `runtime.exs` - Runtime configuration (evaluated at runtime)

## Key Configurations

### AMQP Settings
- URL: `amqp://guest:guest@localhost:5672`
- Exchange: `cybernetic.exchange` (topic, durable)
- Queues for each VSM system (S1-S5)

### VSM System Configuration
- System1: Operations queue
- System2: Coordination queue
- System3: Control queue
- System4: Intelligence queue
- System5: Policy queue

## Environment Variables
- `AMQP_URL` - RabbitMQ connection URL
- `AMQP_EXCHANGE` - Exchange name
- `AMQP_QUEUE_PREFIX` - Queue name prefix

## Important Notes
- Runtime config evaluated at application start
- Supports hot configuration reloading
- Uses Config module (not deprecated Mix.Config)