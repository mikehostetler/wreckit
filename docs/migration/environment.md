# Environment Variables

Environment variable configuration for SDK mode.

## ANTHROPIC_API_KEY

Your Anthropic API key for Claude Agent SDK.

Required for: `claude_sdk` agent kind

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Where to set:
- Shell profile (.bashrc, .zshrc)
- .env file
- CI/CD secrets
- ~/.anthropic/config.json

## Configuration Precedence

1. Environment variables (highest priority)
2. ~/.anthropic/config.json
3. .anthropic-config.json in project directory
4. Fallback to process mode (if configured)

[Back to Migration Guide](/migration/)
