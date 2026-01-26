[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [commands/dream](../README.md) / dreamCommand

# Function: dreamCommand()

> **dreamCommand**(`options`, `logger`): `Promise`\<`void`\>

Defined in: [commands/dream.ts:194](https://github.com/jmanhype/wreckit/blob/f8592a1b38942d214408b93074a73600554f044b/src/commands/dream.ts#L194)

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
