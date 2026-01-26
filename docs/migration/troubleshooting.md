# Troubleshooting

Common issues and solutions during migration.

## Common Issues

### "Credentials not found for SDK mode"

**Cause:** API key not configured

**Solutions:**
1. Set environment variable:
   ```bash
   export ANTHROPIC_API_KEY="your-key"
   ```
2. Or create `~/.anthropic/config.json`:
   ```json
   {"apiKey": "your-key"}
   ```

### "Failed to initialize SDK client"

**Cause:** Invalid credentials or network issue

**Solutions:**
1. Verify API key is valid
2. Check network connectivity
3. Try `curl` to Anthropic API:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

### "Falling back to process mode"

**Cause:** SDK mode failed, using process mode fallback

**This is normal if:**
- You're intentionally using process mode
- SDK credentials aren't configured

**To use SDK mode:**
- Ensure credentials are set (see [Environment Variables](/migration/environment))
- Update config to use SDK kind

### "Agent kind not recognized"

**Cause:** Invalid agent kind in config

**Valid kinds:**
- `claude_sdk`
- `amp_sdk`
- `codex_sdk`
- `opencode_sdk`
- `process`

**Check your `.wreckit/config.json`:**
```json
{
  "agent": {
    "kind": "claude_sdk"  // Must be one of the valid kinds
  }
}
```

### "Model not accessible"

**Cause:** Model name is wrong or not available

**Solutions:**
1. Check model name spelling
2. Verify model is available in your account
3. Try `claude-sonnet-4-20250514` (recommended)

### Configuration Not Applied

**Cause:** Config file in wrong location or malformed JSON

**Solutions:**
1. Verify file exists: `.wreckit/config.json`
2. Validate JSON:
   ```bash
   cat .wreckit/config.json | jq .
   ```
3. Check file is in project root (not subdirectory)

### Old Config Not Working

**Cause:** Using legacy `mode` format

**Solution:** Migrate to `kind` format

**Old:**
```json
{"agent": {"mode": "claude"}}
```

**New:**
```json
{"agent": {"kind": "claude_sdk"}}
```

## Getting Help

If you're still stuck:

1. **Run with verbose logging:**
   ```bash
   wreckit --verbose
   ```

2. **Check your config:**
   ```bash
   wreckit doctor
   ```

3. **Review the full migration guide:** [MIGRATION.md](https://github.com/mikehostetler/wreckit/blob/main/MIGRATION.md)

4. **Open an issue:** [GitHub Issues](https://github.com/mikehostetler/wreckit/issues)

## Debug Mode

For detailed debugging:

```bash
# Enable debug logging
wreckit --debug

# Check configuration
wreckit doctor

# Dry run to see what would happen
wreckit --dry-run
```

[Back to Migration Guide](/migration/)
