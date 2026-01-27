[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / getAgentConfigUnion

# Function: getAgentConfigUnion()

> **getAgentConfigUnion**(`config`): \{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \} \| \{ `aiProvider`: `"anthropic"` \| `"openai"` \| `"google"` \| `"zai"`; `kind`: `"rlm"`; `maxIterations`: `number`; `model`: `string`; \}

Defined in: [agent/runner.ts:60](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L60)

Get agent configuration in union format from resolved config.

This is the **new** helper that returns the discriminated union format
directly from the resolved config. Use this with `runAgentUnion` for
the modern agent dispatch system.

## Parameters

### config

`ConfigResolved`

The resolved wreckit configuration

## Returns

\{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \} \| \{ `aiProvider`: `"anthropic"` \| `"openai"` \| `"google"` \| `"zai"`; `kind`: `"rlm"`; `maxIterations`: `number`; `model`: `string`; \}

The agent configuration in union format (AgentConfigUnion)

## Example

```typescript
const agentConfig = getAgentConfigUnion(resolvedConfig);
const result = await runAgentUnion({ config: agentConfig, cwd: "/project", ... });
```
