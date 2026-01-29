[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / registerProcessAgent

# Function: registerProcessAgent()

> **registerProcessAgent**(`child`): `void`

Defined in: [agent/lifecycle.ts:41](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/lifecycle.ts#L41)

Register a process-based agent for cleanup on process exit.
Called when a process agent is spawned.

## Parameters

### child

`ChildProcess`

The ChildProcess to register for cleanup

## Returns

`void`
