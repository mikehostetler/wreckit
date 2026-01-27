[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / registerSdkController

# Function: registerSdkController()

> **registerSdkController**(`controller`): `void`

Defined in: [agent/lifecycle.ts:21](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/lifecycle.ts#L21)

Register an SDK agent's AbortController for cleanup on process exit.
Called by each SDK runner (claude, amp, codex, opencode, rlm) when an agent starts.

## Parameters

### controller

`AbortController`

The AbortController to register for cleanup

## Returns

`void`
