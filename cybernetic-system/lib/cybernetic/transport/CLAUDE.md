# Transport Directory - Message Transport Layer

## Purpose
Handles all inter-system communication via AMQP.

## Key Components

### AMQP Connection
- `amqp/connection.ex` - Connection management with reconnection logic
- Maintains persistent connection to RabbitMQ
- Auto-reconnects on failure

## Configuration
- Connection URL from `AMQP_URL` env var
- Default: `amqp://guest:guest@localhost:5672`
- Exchange: `cybernetic.exchange` (topic, durable)

## Queue Structure
```
cybernetic.exchange (topic)
├── vsm.system1.operations
├── vsm.system2.coordination
├── vsm.system3.control
├── vsm.system4.intelligence
└── vsm.system5.policy
```

## Message Format
```elixir
%{
  "operation" => String.t(),
  "payload" => map(),
  "meta" => %{
    "timestamp" => DateTime.t(),
    "source" => String.t(),
    "correlation_id" => String.t()
  }
}
```

## Testing
```bash
mix run test_amqp.exs
```
