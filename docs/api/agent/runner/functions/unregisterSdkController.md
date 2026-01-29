[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / unregisterSdkController

# Function: unregisterSdkController()

> **unregisterSdkController**(`controller`): `void`

Defined in: [agent/lifecycle.ts:31](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/lifecycle.ts#L31)

Unregister an SDK agent's AbortController after normal completion.
Called by each SDK runner in their finally block.

## Parameters

### controller

`AbortController`

The AbortController to unregister

## Returns

`void`
