import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { MobileConfig, Ticket, RunMeta, RunEvent, RunPhase } from "../shared/contracts.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export interface ExecutorOptions {
  config: MobileConfig;
  repoPath: string;
  sessionId: string;
  onEvent?: (event: RunEvent) => void;
  onLog?: (message: string) => void;
}

export interface ExecutionResult {
  success: boolean;
  runId: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

export class Executor {
  private config: MobileConfig;
  private repoPath: string;
  private sessionId: string;
  private onEvent?: (event: RunEvent) => void;
  private onLog?: (message: string) => void;
  private abortController: AbortController | null = null;

  constructor(options: ExecutorOptions) {
    this.config = options.config;
    this.repoPath = options.repoPath;
    this.sessionId = options.sessionId;
    this.onEvent = options.onEvent;
    this.onLog = options.onLog;
  }

  async executeTicket(ticket: Ticket): Promise<ExecutionResult> {
    const runId = `R-${randomUUID()}`;
    this.abortController = new AbortController();

    const runMeta: RunMeta = {
      id: runId,
      sessionId: this.sessionId,
      ticketId: ticket.id,
      status: "pending",
      startedAt: new Date().toISOString(),
    };

    this.saveRunMeta(runMeta);
    this.emitEvent(runId, "started", undefined, `Starting execution for ${ticket.title}`);

    try {
      const itemId = await this.createWreckitItem(ticket);
      if (!itemId) {
        throw new Error("Failed to create Wreckit item");
      }

      runMeta.status = "running";
      this.saveRunMeta(runMeta);

      const phases: RunPhase[] = ["research", "plan", "implement", "pr"];

      for (const phase of phases) {
        if (this.abortController.signal.aborted) {
          throw new Error("Execution stopped by user");
        }

        this.emitEvent(runId, "phase_started", phase, `Starting ${phase} phase`);
        runMeta.currentPhase = phase;
        this.saveRunMeta(runMeta);

        const result = await this.runWreckitPhase(itemId, phase);

        if (!result.success) {
          this.emitEvent(runId, "phase_failed", phase, result.error || `${phase} failed`);
          throw new Error(`${phase} phase failed: ${result.error}`);
        }

        this.emitEvent(runId, "phase_completed", phase, `${phase} completed`);

        if (phase === "pr" && result.prUrl) {
          runMeta.prUrl = result.prUrl;
          runMeta.prNumber = result.prNumber;
          this.emitEvent(runId, "pr_opened", undefined, `PR opened: ${result.prUrl}`, {
            prUrl: result.prUrl,
            prNumber: result.prNumber,
          });
        }
      }

      runMeta.status = "completed";
      runMeta.completedAt = new Date().toISOString();
      this.saveRunMeta(runMeta);
      this.emitEvent(runId, "completed", undefined, "Execution completed successfully");

      return {
        success: true,
        runId,
        prUrl: runMeta.prUrl,
        prNumber: runMeta.prNumber,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runMeta.status = this.abortController.signal.aborted ? "stopped" : "failed";
      runMeta.completedAt = new Date().toISOString();
      this.saveRunMeta(runMeta);

      this.emitEvent(
        runId,
        this.abortController.signal.aborted ? "stopped" : "error",
        undefined,
        errorMsg
      );

      return { success: false, runId, error: errorMsg };
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async createWreckitItem(ticket: Ticket): Promise<string | null> {
    const itemId = `${this.sessionId.slice(2, 10)}/${ticket.id.toLowerCase()}`;
    const itemDir = join(this.repoPath, ".wreckit", "items", itemId);

    if (!existsSync(itemDir)) {
      mkdirSync(itemDir, { recursive: true });
    }

    const itemJson = {
      id: itemId,
      title: ticket.title,
      section: this.sessionId.slice(2, 10),
      state: "idea",
      overview: `${ticket.description}\n\nAcceptance Criteria:\n${ticket.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`,
      priority_hint: ticket.priority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
    };

    writeFileSync(join(itemDir, "item.json"), JSON.stringify(itemJson, null, 2));

    const indexPath = join(this.repoPath, ".wreckit", "index.json");
    let index: { items: { id: string; state: string; title: string }[] } = { items: [] };
    if (existsSync(indexPath)) {
      try {
        index = JSON.parse(readFileSync(indexPath, "utf-8"));
      } catch {
        index = { items: [] };
      }
    }

    const existing = index.items.findIndex((i) => i.id === itemId);
    if (existing >= 0) {
      index.items[existing] = { id: itemId, state: "idea", title: ticket.title };
    } else {
      index.items.push({ id: itemId, state: "idea", title: ticket.title });
    }
    writeFileSync(indexPath, JSON.stringify(index, null, 2));

    this.log(`Created Wreckit item: ${itemId}`);
    return itemId;
  }

  private async runWreckitPhase(
    itemId: string,
    phase: RunPhase
  ): Promise<{ success: boolean; error?: string; prUrl?: string; prNumber?: number }> {
    return new Promise((resolve) => {
      const args = [phase, itemId, "--cwd", this.repoPath];

      this.log(`Running: wreckit ${args.join(" ")}`);

      const proc = spawn("bun", ["run", "./src/index.ts", ...args], {
        cwd: join(this.repoPath, "..", "WreckitGo"),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        this.log(text.trim());
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        if (!text.includes("$")) {
          this.log(`[stderr] ${text.trim()}`);
        }
      });

      const abortHandler = () => {
        proc.kill("SIGTERM");
        resolve({ success: false, error: "Stopped by user" });
      };
      this.abortController?.signal.addEventListener("abort", abortHandler);

      proc.on("close", (code) => {
        this.abortController?.signal.removeEventListener("abort", abortHandler);

        if (code === 0) {
          const prUrlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
          const prNumberMatch = prUrlMatch?.[0].match(/\/pull\/(\d+)/);

          resolve({
            success: true,
            prUrl: prUrlMatch?.[0],
            prNumber: prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined,
          });
        } else {
          resolve({ success: false, error: stderr || `Exit code ${code}` });
        }
      });

      proc.on("error", (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  private saveRunMeta(meta: RunMeta): void {
    const runsDir = join(this.repoPath, ".wreckit", "sessions", this.sessionId, "runs");
    if (!existsSync(runsDir)) {
      mkdirSync(runsDir, { recursive: true });
    }
    const runDir = join(runsDir, meta.id);
    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true });
    }
    writeFileSync(join(runDir, "run.json"), JSON.stringify(meta, null, 2));
  }

  private emitEvent(
    runId: string,
    kind: RunEvent["kind"],
    phase?: RunPhase,
    message?: string,
    data?: Record<string, unknown>
  ): void {
    const event: RunEvent = {
      id: `E-${randomUUID()}`,
      runId,
      kind,
      timestamp: new Date().toISOString(),
      phase,
      message,
      data,
    };

    if (this.onEvent) {
      this.onEvent(event);
    }

    const runsDir = join(this.repoPath, ".wreckit", "sessions", this.sessionId, "runs", runId);
    if (existsSync(runsDir)) {
      const eventsPath = join(runsDir, "events.json");
      let events: RunEvent[] = [];
      if (existsSync(eventsPath)) {
        try {
          events = JSON.parse(readFileSync(eventsPath, "utf-8"));
        } catch {}
      }
      events.push(event);
      writeFileSync(eventsPath, JSON.stringify(events, null, 2));
    }
  }

  private log(message: string): void {
    log.info(message);
    if (this.onLog) {
      this.onLog(message);
    }
  }
}
