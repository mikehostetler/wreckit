[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / runAgentUnion

# Function: runAgentUnion()

> **runAgentUnion**(`options`): `Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>

Defined in: [agent/runner.ts:126](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L126)

Run an agent using the discriminated union config.

This is the **new** dispatch system that supports multiple agent backends
via a kind-based discriminated union. It's the preferred way to run agents
in wreckit.

**Supported agent kinds:**
- `process`: External process-based agent (fallback mode)
- `claude_sdk`: Claude Agent SDK integration
- `amp_sdk`: Sourcegraph Amp SDK integration
- `codex_sdk`: OpenAI Codex SDK integration
- `opencode_sdk`: OpenCode SDK integration
- `rlm`: Recursive Language Model mode (experimental)

**Features:**
- Type-safe dispatch based on agent kind
- Direct passing of union configs (no conversion overhead)
- Support for dry-run and mock-agent modes
- MCP server integration
- Tool allowlist support
- Streaming output via callbacks

## Parameters

### options

[`UnionRunAgentOptions`](../interfaces/UnionRunAgentOptions.md)

Union run options with AgentConfigUnion

## Returns

`Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>

Promise<AgentResult> with execution results

## Example

```typescript
const result = await runAgentUnion({
  config: { kind: "claude_sdk", model: "claude-sonnet-4-20250514", max_tokens: 8192 },
  cwd: "/project",
  prompt: "Fix the bug",
  logger: console,
  timeoutSeconds: 3600
});
```
