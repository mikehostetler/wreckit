[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [commands/dream](../README.md) / dreamCommand

# Function: dreamCommand()

> **dreamCommand**(`options`, `logger`): `Promise`\<`void`\>

Defined in: [commands/dream.ts:218](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/commands/dream.ts#L218)

Run the Dreamer agent to autonomously identify opportunities in the codebase.

The Dreamer scans for TODOs, FIXMEs, technical debt, and architectural gaps,
then generates new roadmap items to address them.

## Parameters

### options

[`DreamOptions`](../interfaces/DreamOptions.md)

### logger

`Logger`

## Returns

`Promise`\<`void`\>
