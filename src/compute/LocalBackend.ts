import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import { getItemDir } from "../fs/paths";
import { runAgent, getAgentConfig } from "../agent/runner";
import type {
  ComputeBackend,
  LogEvent,
  IterationOptions,
  IterationState,
} from "./ComputeBackend";
import { IterationStateSchema } from "./ComputeBackend";

export class LocalBackend implements ComputeBackend {
  readonly name = "local";

  constructor(
    private root: string,
    private config: ConfigResolved,
    private logger: Logger,
    private mockAgent: boolean = false
  ) {}

  async *runIteration(
    itemId: string,
    options: IterationOptions
  ): AsyncIterable<LogEvent> {
    const events: LogEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    const pushEvent = (event: LogEvent) => {
      events.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const agentConfig = getAgentConfig(this.config);
    if (options.timeoutSeconds !== undefined) {
      agentConfig.timeout_seconds = options.timeoutSeconds;
    }

    const agentPromise = runAgent({
      config: agentConfig,
      cwd: options.cwd,
      prompt: options.prompt,
      logger: this.logger,
      mockAgent: this.mockAgent,
      mcpServers: options.mcpServers,
      allowedTools: options.allowedTools,
      onStdoutChunk: (chunk: string) => {
        pushEvent({
          type: "stdout",
          message: chunk,
          timestamp: new Date().toISOString(),
        });
      },
      onStderrChunk: (chunk: string) => {
        pushEvent({
          type: "stderr",
          message: chunk,
          timestamp: new Date().toISOString(),
        });
      },
    });

    agentPromise.finally(() => {
      done = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }
  }

  async sync(
    _direction: "upload" | "download",
    _paths: string[]
  ): Promise<void> {
    // No-op for local execution - files are already in place
  }

  async readState(itemId: string): Promise<IterationState> {
    const statePath = path.join(getItemDir(this.root, itemId), "state.json");

    try {
      const content = await fs.readFile(statePath, "utf-8");
      const data = JSON.parse(content);
      const result = IterationStateSchema.safeParse(data);
      if (result.success) {
        return result.data;
      }
      this.logger.warn(`Invalid state.json for ${itemId}: ${result.error.message}`);
      return { status: "CONTINUE" };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { status: "CONTINUE" };
      }
      throw err;
    }
  }

  async writeResponse(itemId: string, response: string): Promise<void> {
    const responsePath = path.join(
      getItemDir(this.root, itemId),
      "response.json"
    );
    await fs.writeFile(
      responsePath,
      JSON.stringify({ response, timestamp: new Date().toISOString() }, null, 2)
    );
  }

  async cleanup(): Promise<void> {
    // No-op for local execution - nothing to clean up
  }
}
