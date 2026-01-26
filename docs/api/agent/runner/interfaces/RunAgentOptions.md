[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / RunAgentOptions

# Interface: RunAgentOptions

Defined in: [agent/runner.ts:73](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L73)

## Properties

### allowedTools?

> `optional` **allowedTools**: `string`[]

Defined in: [agent/runner.ts:85](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L85)

Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc.

***

### config

> **config**: [`AgentConfig`](AgentConfig.md)

Defined in: [agent/runner.ts:74](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L74)

***

### cwd

> **cwd**: `string`

Defined in: [agent/runner.ts:75](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L75)

***

### dryRun?

> `optional` **dryRun**: `boolean`

Defined in: [agent/runner.ts:78](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L78)

***

### logger

> **logger**: `Logger`

Defined in: [agent/runner.ts:77](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L77)

***

### mcpServers?

> `optional` **mcpServers**: `Record`\<`string`, `unknown`\>

Defined in: [agent/runner.ts:83](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L83)

***

### mockAgent?

> `optional` **mockAgent**: `boolean`

Defined in: [agent/runner.ts:79](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L79)

***

### onAgentEvent()?

> `optional` **onAgentEvent**: (`event`) => `void`

Defined in: [agent/runner.ts:82](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L82)

#### Parameters

##### event

`AgentEvent`

#### Returns

`void`

***

### onStderrChunk()?

> `optional` **onStderrChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:81](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L81)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### onStdoutChunk()?

> `optional` **onStdoutChunk**: (`chunk`) => `void`

Defined in: [agent/runner.ts:80](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L80)

#### Parameters

##### chunk

`string`

#### Returns

`void`

***

### prompt

> **prompt**: `string`

Defined in: [agent/runner.ts:76](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L76)
