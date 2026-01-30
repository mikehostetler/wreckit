# Tools Directory

Development tools and utilities for enhancing the Cybernetic aMCP Framework development experience.

## 🛠️ Available Tools

### Claude Flow
AI workflow automation tool for intelligent code generation and task management.

### Goldrush Investigation
Telemetry and event investigation suite for:
- Event tracing and analysis
- Performance profiling
- System behavior debugging
- Telemetry data exploration

### Hive Mind (.hive-mind)
Distributed intelligence configurations for multi-agent coordination.

### Roo Assistant (.roo)
Rule-based AI assistant with specialized modes:
- `rules-code/` - Code generation rules
- `rules-debug/` - Debugging assistance
- `rules-spec-pseudocode/` - Specification writing
- `rules-refinement-optimization-mode/` - Code optimization
- `rules-tutorial/` - Learning mode
- `rules-post-deployment-monitoring-mode/` - Production monitoring

### Swarm Mode (.swarm)
Multi-agent swarm coordination configurations.

## 🚀 Usage

### Claude Flow
```bash
./tools/claude-flow/claude-flow
```

### Goldrush Investigation
```bash
cd tools/goldrush-investigation
mix run investigate.exs
```

### Roo Assistant
Roo rules are automatically loaded by compatible AI assistants. Place custom rules in appropriate subdirectories.

## 📦 Installation

Most tools are self-contained. For tools requiring dependencies:

```bash
cd tools/<tool-name>
mix deps.get  # For Elixir tools
npm install   # For Node.js tools
```

## 🔧 Configuration

Each tool may have its own configuration file:
- Claude Flow: `claude-flow/config.json`
- Roo: `.roo/config.yml`
- Hive Mind: `.hive-mind/settings.json`

## 📝 Development

To add new tools:
1. Create a subdirectory in `tools/`
2. Include a README with usage instructions
3. Add configuration examples
4. Update this README