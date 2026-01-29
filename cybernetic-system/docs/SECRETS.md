# Secrets Management Guide

## ⚠️ IMPORTANT: Never Commit Secrets

This project uses environment variables to manage sensitive information. **NEVER** commit actual API keys, passwords, or other secrets to the repository.

## Setup Instructions

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your actual values:**
   ```bash
   # Use your preferred editor
   nano .env
   # or
   vim .env
   ```

3. **Source the environment (optional for local development):**
   ```bash
   source .env
   # or use direnv for automatic loading
   brew install direnv
   echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
   direnv allow .
   ```

## Required API Keys

### Anthropic (Claude)
- Sign up at: https://console.anthropic.com
- Create an API key in the console
- Set: `ANTHROPIC_API_KEY=sk-ant-...`

### OpenAI
- Sign up at: https://platform.openai.com
- Create an API key in the dashboard
- Set: `OPENAI_API_KEY=sk-...`

### Together AI
- Sign up at: https://together.ai
- Create an API key in your account settings
- Set: `TOGETHER_API_KEY=...`

## Security Best Practices

### 1. Use a Password Manager
Store your API keys in a password manager (1Password, Bitwarden, etc.) and copy them when needed.

### 2. Rotate Keys Regularly
Rotate your API keys periodically:
- Delete old keys from provider dashboards
- Generate new keys
- Update your `.env` file

### 3. Use Different Keys for Different Environments
- Development: Use restricted keys with lower rate limits
- Staging: Use separate keys from production
- Production: Use keys with appropriate permissions and monitoring

### 4. Check for Exposed Secrets
Before committing, always check:
```bash
# Check if any secrets might be exposed
git diff --staged | grep -E "(api[_-]?key|password|secret|token)" -i

# Use git-secrets to prevent commits with secrets
brew install git-secrets
git secrets --install
git secrets --register-aws  # For AWS keys
git secrets --add 'sk-ant-api[0-9]{2}-[A-Za-z0-9-_]+'  # Anthropic pattern
git secrets --add 'sk-[A-Za-z0-9]+'  # OpenAI pattern
```

### 5. Environment-Specific Configuration

#### For Docker:
```bash
# Use docker-compose with env file
docker-compose --env-file .env up

# Or pass individual variables
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY myapp
```

#### For Elixir/Mix:
```elixir
# In config/runtime.exs
config :my_app,
  anthropic_api_key: System.get_env("ANTHROPIC_API_KEY")
```

#### For Tests:
```bash
# Run tests with environment variables
ANTHROPIC_API_KEY=test-key mix test

# Or use a test-specific env file
cp .env.example .env.test
# Edit .env.test with test keys
source .env.test && mix test
```

## Troubleshooting

### Missing Environment Variables
If you see errors about missing API keys:
1. Check that `.env` exists: `ls -la .env`
2. Verify the variable is set: `echo $ANTHROPIC_API_KEY`
3. Source the file if needed: `source .env`

### GitHub Push Protection
If GitHub blocks your push due to detected secrets:
1. Remove the secret from your code
2. Use environment variables instead
3. If it's a false positive, you can bypass (not recommended) via the GitHub UI

### Accidentally Committed Secrets
If you accidentally committed a secret:
1. **Immediately revoke the key** in the provider's dashboard
2. Generate a new key
3. Remove from history:
   ```bash
   # Install BFG Repo-Cleaner
   brew install bfg
   
   # Remove the secret from all commits
   bfg --replace-text passwords.txt repo.git
   
   # Force push the cleaned history
   git push --force
   ```

## CI/CD Configuration

### GitHub Actions
Add secrets in: Settings → Secrets and variables → Actions
```yaml
- name: Run tests
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: mix test
```

### Local CI Testing
Test GitHub Actions locally with act:
```bash
brew install act
act -s ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

## Emergency Response

If a secret is exposed:
1. **Revoke immediately** - Don't wait, revoke the key NOW
2. **Generate new key** - Create a replacement
3. **Audit usage** - Check provider logs for unauthorized use
4. **Update all systems** - Update the key everywhere it's used
5. **Document incident** - Record what happened for future prevention

## Additional Resources

- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [12 Factor App - Config](https://12factor.net/config)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)