[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / UnionRunAgentOptions

# Interface: UnionRunAgentOptions

Defined in: [agent/runner.ts:68](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L68)

## Properties

### allowedTools?

> `optional` **allowedTools**: `string`[]

Defined in: [agent/runner.ts:82](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L82)

Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc.

***

### config

> **config**: \{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \} \| \{ `aiProvider`: `"anthropic"` \| `"openai"` \| `"google"` \| `"zai"`; `kind`: `"rlm"`; `maxIterations`: `number`; `model`: `string`; \}

Defined in: [agent/runner.ts:69](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L69)

***

### cwd

> **cwd**: `string`

Defined in: [agent/runner.ts:70](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L70)

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [agent/runner.ts:73](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L73)

***

### logger

> **logger**: `Logger`

Defined in: [agent/runner.ts:72](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L72)

***

### mcpServers?

> `optional` **mcpServers**: `Record`\<`string`, `unknown`\>

Defined in: [agent/runner.ts:80](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L80)

MCP servers to make available to the agent (e.g., wreckit server for PRD capture)

***

### mockAgent?

> `optional` **mockAgent**: `boolean`

Defined in: [agent/runner.ts:74](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L74)

***

### onAgentEvent()?

> `optional` **onAgentEvent**: (`event`) => `void`

Defined in: [agent/runner.ts:78](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L78)

#### Parameters

##### event

`AgentEvent`

#### Returns

`void`

***

### onStderrChunk()?

> `optional` **onStderrChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:77](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L77)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### onStdoutChunk()?

> `optional` **onStdoutChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:76](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L76)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### prompt

> **prompt**: `string`

Defined in: [agent/runner.ts:71](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L71)

***

### timeoutSeconds?

> `optional` **timeoutSeconds**: `number`

Defined in: [agent/runner.ts:75](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/runner.ts#L75)
