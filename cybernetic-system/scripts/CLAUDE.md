# Scripts Directory

## Purpose
Utility scripts for testing, deployment, and system validation.

## Structure
- `demo/` - Demonstration scripts
  - `demo_*.exs` - Feature demonstrations
- `prove/` - System validation scripts
  - `prove_*.exs` - System proof and validation
- `test/` - Test and verification scripts
  - `test_*.exs` - Integration tests
  - `verify_*.exs` - Verification scripts
  - `simple_*.exs` - Simple test cases

## Categories

### Demo Scripts
- Policy intelligence demonstrations
- S4 routing examples
- System capability showcases

### Proof Scripts
- Circuit breaker validation
- Deployment verification
- System integration proofs
- Telegram bot validation

### Test Scripts
- Integration tests
- Health checks
- Telemetry validation
- Provider testing (Anthropic, OpenAI, Ollama)

## Usage
```bash
# Run a demo
mix run scripts/demo/demo_s4_routing.exs

# Validate system
mix run scripts/prove/prove_entire_system.exs

# Run tests
mix run scripts/test/test_integration.exs
```