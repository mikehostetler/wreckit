# Lib Directory - Core Application Code

## Structure
- `cybernetic/` - Main application modules
  - `application.ex` - OTP application supervisor
  - `plugin.ex` - Plugin behavior definition
  - `plugin_registry.ex` - Plugin registration system
  
## Subdirectories
- `vsm/` - Viable System Model implementation (S1-S5)
- `transport/` - AMQP transport layer
- `core/` - Core functionality (CRDT, MCP, Security)
- `apps/` - Application-specific modules
- `ui/` - User interface components

## VSM Systems
- **System1**: Operational - Entry points, AMQP workers
- **System2**: Coordination - Attention and resource allocation
- **System3**: Control - Monitoring and intervention
- **System4**: Intelligence - Analysis and learning
- **System5**: Policy - Identity and goal setting

## Key Patterns
- GenServer for stateful processes
- Supervisor trees for fault tolerance
- Message handlers for AMQP routing