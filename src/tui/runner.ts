import React from "react";
import { render, type Instance } from "ink";
import { PassThrough } from "stream";
import type { IndexItem } from "../schemas";
import type { Logger } from "../logging";
import { createTuiState, updateTuiState, type TuiState } from "./dashboard";
import { InkApp } from "./InkApp";

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
