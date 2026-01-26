[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / getAgentConfigUnion

# Function: getAgentConfigUnion()

> **getAgentConfigUnion**(`config`): \{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \}

Defined in: [agent/runner.ts:92](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L92)

Get agent configuration in union format from resolved config.
This is the new helper that replaces getAgentConfig.

## Parameters

### config

`ConfigResolved`

## Returns

\{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \}
