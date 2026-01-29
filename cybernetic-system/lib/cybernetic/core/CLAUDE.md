# Core Directory - Foundation Components

## Purpose
Core functionality that the entire Cybernetic system depends on.

## Components

### CRDT (Conflict-free Replicated Data Types)
- `crdt/context_graph.ex` - Semantic graph with causal metadata
- `crdt/graph.ex` - Graph data structure
- Uses DeltaCRDT for efficient synchronization

### MCP (Model Context Protocol)
- `mcp/core.ex` - Core MCP functionality
- `mcp/transports/` - Transport adapters (Hermes, MAGG)
- Enables AI tool integration

### Security
- `security/security.ex` - Security utilities
- Nonce generation and validation
- Bloom filter for replay prevention

### Transport
- `transport/amqp/` - AMQP implementation
- `transport/amqp/causality.ex` - Causal ordering
- `transport/amqp/topology.ex` - Queue topology

### Goldrush
- `goldrush/elixir/engine.ex` - Elixir engine
- `goldrush/plugins/behaviour.ex` - Plugin behavior
- `goldrush/telemetry/collector.ex` - Metrics collection

## Key Patterns
- Behaviors for extensibility
- GenServer for stateful processes
- Supervisors for fault tolerance
