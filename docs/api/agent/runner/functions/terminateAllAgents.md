[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / terminateAllAgents

# Function: terminateAllAgents()

> **terminateAllAgents**(`logger?`): `void`

Defined in: [agent/lifecycle.ts:64](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/lifecycle.ts#L64)

Terminate all active agents (both SDK and process-based).
Called on process exit or when user interrupts execution (Ctrl+C).

**SDK agents**: Aborts their AbortController, which signals cancellation to the SDK.
**Process agents**: Sends SIGTERM, then SIGKILL after 5 seconds if still running.

## Parameters

### logger?

`Logger`

Optional logger for debug output

## Returns

`void`
