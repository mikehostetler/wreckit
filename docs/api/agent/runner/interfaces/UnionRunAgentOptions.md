[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / UnionRunAgentOptions

# Interface: UnionRunAgentOptions

Defined in: [agent/runner.ts:323](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L323)

## Properties

### allowedTools?

> `optional` **allowedTools**: `string`[]

Defined in: [agent/runner.ts:337](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L337)

Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc.

***

### config

> **config**: \{ `args`: `string`[]; `command`: `string`; `completion_signal`: `string`; `kind`: `"process"`; \} \| \{ `kind`: `"claude_sdk"`; `max_tokens`: `number`; `model`: `string`; `tools?`: `string`[]; \} \| \{ `kind`: `"amp_sdk"`; `model?`: `string`; \} \| \{ `kind`: `"codex_sdk"`; `model`: `string`; \} \| \{ `kind`: `"opencode_sdk"`; \}

Defined in: [agent/runner.ts:324](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L324)

***

### cwd

> **cwd**: `string`

Defined in: [agent/runner.ts:325](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L325)

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [agent/runner.ts:328](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L328)

***

### logger

> **logger**: `Logger`

Defined in: [agent/runner.ts:327](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L327)

***

### mcpServers?

> `optional` **mcpServers**: `Record`\<`string`, `unknown`\>

Defined in: [agent/runner.ts:335](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L335)

MCP servers to make available to the agent (e.g., wreckit server for PRD capture)

***

### mockAgent?

> `optional` **mockAgent**: `boolean`

Defined in: [agent/runner.ts:329](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L329)

***

### onAgentEvent()?

> `optional` **onAgentEvent**: (`event`) => `void`

Defined in: [agent/runner.ts:333](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L333)

#### Parameters

##### event

`AgentEvent`

#### Returns

`void`

***

### onStderrChunk()?

> `optional` **onStderrChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:332](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L332)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### onStdoutChunk()?

> `optional` **onStdoutChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:331](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L331)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### prompt

> **prompt**: `string`

Defined in: [agent/runner.ts:326](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L326)

***

### timeoutSeconds?

> `optional` **timeoutSeconds**: `number`

Defined in: [agent/runner.ts:330](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L330)
