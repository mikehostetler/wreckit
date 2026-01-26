[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / runAgentUnion

# Function: runAgentUnion()

> **runAgentUnion**(`options`): `Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>

Defined in: [agent/runner.ts:348](https://github.com/mikehostetler/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/agent/runner.ts#L348)

Run an agent using the new discriminated union config.
This is the new dispatch system that supports multiple agent backends.

## Parameters

### options

[`UnionRunAgentOptions`](../interfaces/UnionRunAgentOptions.md)

## Returns

`Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>
