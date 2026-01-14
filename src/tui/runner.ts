import React from "react";
import { render, type Instance } from "ink";
import { PassThrough } from "stream";
import type { IndexItem } from "../schemas";
import type { Logger } from "../logging";
import { createTuiState, updateTuiState, type TuiState, type AgentActivityForItem, type ToolExecution } from "./dashboard";
import { InkApp } from "./InkApp";
import type { AgentEvent } from "./agentEvents";

export interface TuiOptions {
  onQuit?: () => void;
  onLogs?: () => void;
  debug?: boolean;
  debugLogger?: Logger;
}

export class TuiRunner {
  private state: TuiState;
  private options: TuiOptions;
  private subscribers = new Set<(state: TuiState) => void>();
  private inkInstance: Instance | null = null;
  private debugStream: PassThrough | null = null;
  private frameCount = 0;

  constructor(items: IndexItem[], options?: TuiOptions) {
    this.state = createTuiState(items);
    this.options = options ?? {};
  }

  subscribe(cb: (state: TuiState) => void): () => void {
    this.subscribers.add(cb);
    cb(this.state);
    return () => this.subscribers.delete(cb);
  }

  private notify(): void {
    for (const cb of this.subscribers) {
      cb(this.state);
    }
  }

  start(): void {
    const subscribe = this.subscribe.bind(this);
    const onQuit = () => {
      this.stop();
      this.options.onQuit?.();
    };

    const { debug, debugLogger } = this.options;

    if (debug && debugLogger) {
      this.debugStream = new PassThrough();
      let buffer = "";

      this.debugStream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            this.frameCount++;
            debugLogger.debug(`[TUI Frame ${this.frameCount}] ${line}`);
          }
        }
      });

      debugLogger.debug("[TUI Debug] Starting Ink with debug stream capture");

      this.inkInstance = render(
        React.createElement(InkApp, {
          subscribe,
          onQuit,
          initialState: this.state,
        }),
        {
          stdout: this.debugStream as unknown as NodeJS.WriteStream,
          debug: true,
        }
      );
    } else {
      this.inkInstance = render(
        React.createElement(InkApp, {
          subscribe,
          onQuit,
          initialState: this.state,
        })
      );
    }
  }

  update(update: Partial<TuiState>): void {
    this.state = updateTuiState(this.state, update);
    this.notify();
  }

  stop(): void {
    if (this.options.debugLogger) {
      this.options.debugLogger.debug(`[TUI Debug] Stopping after ${this.frameCount} frames`);
    }
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
    if (this.debugStream) {
      this.debugStream.end();
      this.debugStream = null;
    }
    this.subscribers.clear();
  }

  appendLog(chunk: string): void {
    const lines = chunk.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) return;

    const maxLogs = 500;
    const newLogs = [...this.state.logs, ...lines].slice(-maxLogs);
    this.state = updateTuiState(this.state, { logs: newLogs });
    this.notify();
  }

  getState(): TuiState {
    return this.state;
  }

  appendAgentEvent(itemId: string, event: AgentEvent): void {
    const MAX_THOUGHTS = 50;
    const MAX_TOOLS = 20;

    const existing = this.state.activityByItem[itemId];
    const activity: AgentActivityForItem = existing ?? { thoughts: [], tools: [] };

    switch (event.type) {
      case "assistant_text": {
        const newThoughts = [...activity.thoughts, event.text].slice(-MAX_THOUGHTS);
        activity.thoughts = newThoughts;
        break;
      }
      case "tool_started": {
        const newTool: ToolExecution = {
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          input: event.input,
          status: "running",
          startedAt: new Date(),
        };
        activity.tools = [...activity.tools, newTool].slice(-MAX_TOOLS);
        break;
      }
      case "tool_result": {
        const toolIndex = activity.tools.findIndex((t) => t.toolUseId === event.toolUseId);
        if (toolIndex !== -1) {
          activity.tools = activity.tools.map((t, i) =>
            i === toolIndex
              ? { ...t, status: "completed" as const, result: event.result, finishedAt: new Date() }
              : t
          );
        }
        break;
      }
      case "tool_error": {
        const errorToolIndex = activity.tools.findIndex((t) => t.toolUseId === event.toolUseId);
        if (errorToolIndex !== -1) {
          activity.tools = activity.tools.map((t, i) =>
            i === errorToolIndex ? { ...t, status: "error" as const, finishedAt: new Date() } : t
          );
        }
        break;
      }
      case "error": {
        const errorMessage = `[ERROR] ${event.message}`;
        activity.thoughts = [...activity.thoughts, errorMessage].slice(-MAX_THOUGHTS);
        break;
      }
      case "run_result":
        break;
    }

    this.state = updateTuiState(this.state, {
      activityByItem: {
        ...this.state.activityByItem,
        [itemId]: activity,
      },
    });
    this.notify();
  }
}

export interface SimpleProgress {
  update: (itemId: string, phase: string, message?: string) => void;
  complete: (itemId: string) => void;
  fail: (itemId: string, error: string) => void;
}

export function createSimpleProgress(logger: Logger): SimpleProgress {
  return {
    update(itemId: string, phase: string, message?: string): void {
      const msg = message ? `: ${message}` : "";
      logger.info(`[${itemId}] ${phase}${msg}`);
    },
    complete(itemId: string): void {
      logger.info(`[${itemId}] ✓ complete`);
    },
    fail(itemId: string, error: string): void {
      logger.error(`[${itemId}] ✗ failed: ${error}`);
    },
  };
}
