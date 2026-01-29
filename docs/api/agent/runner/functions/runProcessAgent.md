[**wreckit**](../../../README.md)

***

[wreckit](../../../README.md) / [agent/runner](../README.md) / runProcessAgent

# Function: runProcessAgent()

> **runProcessAgent**(`config`, `options`): `Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>

Defined in: [agent/process-runner.ts:68](https://github.com/jmanhype/wreckit/blob/d2cfffe493bd4fb4f86dbd7fbd82c596c0a86c1d/src/agent/process-runner.ts#L68)

Run a process-based agent using the command specified in config.

This is the fallback mode when SDK agents are unavailable or fail.
It spawns an external process, sends the prompt via stdin, and captures
stdout/stderr. The agent signals completion by outputting a specific
completion signal (e.g., `<promise>COMPLETE</promise>`).

**Features:**
- Process spawning with timeout enforcement
- Stdout/stderr capture with optional streaming callbacks
- Completion signal detection for reliable success/failure determination
- Graceful shutdown (SIGTERM) → force kill (SIGKILL after 5s)
- Lifecycle registration for cleanup on process exit

## Parameters

### config

The process agent configuration

#### args

`string`[] = `...`

#### command

`string` = `...`

#### completion_signal

`string` = `...`

#### kind

`"process"` = `...`

### options

`ProcessRunnerOptions`

Execution options (cwd, prompt, callbacks, etc.)

## Returns

`Promise`\<[`AgentResult`](../interfaces/AgentResult.md)\>

Promise<AgentResult> with success status, output, and exit code

## Example

```typescript
const result = await runProcessAgent(
  { kind: "process", command: "node", args: ["agent.js"], completion_signal: "DONE" },
  { cwd: "/project", prompt: "Hello", logger: console }
);
```
