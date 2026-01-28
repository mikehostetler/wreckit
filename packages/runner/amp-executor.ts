import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { MobileConfig, Ticket, RunMeta, RunEvent, RepoRef } from "../shared/contracts.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export interface AmpExecutorOptions {
  config: MobileConfig;
  repoPath: string;
  sessionId: string;
  onEvent?: (event: RunEvent) => void;
  onLog?: (message: string) => void;
  onRepoSwitch?: (repo: RepoRef) => void;
}

export interface ExecutionResult {
  success: boolean;
  runId: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  threadId?: string;
}

export class AmpExecutor {
  private config: MobileConfig;
  private repoPath: string;
  private sessionId: string;
  private onEvent?: (event: RunEvent) => void;
  private onLog?: (message: string) => void;
  private onRepoSwitch?: (repo: RepoRef) => void;
  private abortController: AbortController | null = null;
  private currentRepoPath: string;

  constructor(options: AmpExecutorOptions) {
    this.config = options.config;
    this.repoPath = options.repoPath;
    this.currentRepoPath = options.repoPath;
    this.sessionId = options.sessionId;
    this.onEvent = options.onEvent;
    this.onLog = options.onLog;
    this.onRepoSwitch = options.onRepoSwitch;
  }

  private resolveRepoPath(ticket: Ticket): string {
    if (ticket.repo) {
      const configRepo = this.config.repos.find(
        (r) => r.owner === ticket.repo!.owner && r.name === ticket.repo!.name
      );
      if (configRepo) {
        return configRepo.localPath;
      }
      this.log(`Warning: Ticket repo ${ticket.repo.owner}/${ticket.repo.name} not found in config`);
    }
    return this.repoPath;
  }

  async executeTicket(ticket: Ticket): Promise<ExecutionResult> {
    const runId = `R-${randomUUID()}`;
    this.abortController = new AbortController();

    this.currentRepoPath = this.resolveRepoPath(ticket);
    if (this.currentRepoPath !== this.repoPath && ticket.repo) {
      const fullRepo = this.config.repos.find(
        (r) => r.owner === ticket.repo!.owner && r.name === ticket.repo!.name
      );
      if (fullRepo && this.onRepoSwitch) {
        this.onRepoSwitch(fullRepo);
      }
      this.log(`Switched to repo: ${ticket.repo.owner}/${ticket.repo.name}`);
    }

    const runMeta: RunMeta = {
      id: runId,
      sessionId: this.sessionId,
      ticketId: ticket.id,
      status: "pending",
      startedAt: new Date().toISOString(),
    };

    this.saveRunMeta(runMeta);
    this.emitEvent(runId, "started", undefined, `Starting Amp execution for ${ticket.title}`);

    try {
      runMeta.status = "running";
      this.saveRunMeta(runMeta);

      this.emitEvent(runId, "phase_started", "implement", "Amp is implementing...");
      
      const result = await this.runAmp(ticket);

      if (!result.success) {
        this.emitEvent(runId, "phase_failed", "implement", result.error || "Amp failed");
        throw new Error(result.error || "Amp execution failed");
      }

      this.emitEvent(runId, "phase_completed", "implement", "Implementation complete");

      if (result.prUrl) {
        runMeta.prUrl = result.prUrl;
        runMeta.prNumber = result.prNumber;
        this.emitEvent(runId, "pr_opened", undefined, `PR opened: ${result.prUrl}`, {
          prUrl: result.prUrl,
          prNumber: result.prNumber,
        });
      }

      runMeta.status = "completed";
      runMeta.completedAt = new Date().toISOString();
      this.saveRunMeta(runMeta);
      this.emitEvent(runId, "completed", undefined, "Execution completed");

      return {
        success: true,
        runId,
        prUrl: runMeta.prUrl,
        prNumber: runMeta.prNumber,
        threadId: result.threadId,
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

  private buildAmpPrompt(ticket: Ticket): string {
    const repoInfo = ticket.repo 
      ? `Repository: ${ticket.repo.owner}/${ticket.repo.name}` 
      : "";
    
    return `# Task: ${ticket.title}

${repoInfo}

## Description
${ticket.description}

## Acceptance Criteria
${ticket.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Instructions
1. Implement the changes described above
2. Make sure all acceptance criteria are met
3. Run any relevant tests or type checks
4. Create a pull request with a clear title and description
5. The PR title should include the ticket ID: "${ticket.id}"

Do not ask for clarification - proceed with implementation based on the requirements above.`;
  }

  private async runAmp(ticket: Ticket): Promise<{ 
    success: boolean; 
    error?: string; 
    prUrl?: string; 
    prNumber?: number;
    threadId?: string;
  }> {
    return new Promise((resolve) => {
      const prompt = this.buildAmpPrompt(ticket);
      const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');

      this.log(`Running Amp for ticket ${ticket.id}...`);

      const proc = spawn(
        "amp",
        [
          "--execute", escapedPrompt,
          "--no-ide",
          "--dangerously-allow-all",
        ],
        {
          cwd: this.currentRepoPath,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        for (const line of text.split("\n").filter((l: string) => l.trim())) {
          this.log(line);
        }
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        stderr += text;
      });

      const abortHandler = () => {
        proc.kill("SIGTERM");
        resolve({ success: false, error: "Stopped by user" });
      };
      this.abortController?.signal.addEventListener("abort", abortHandler);

      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({ success: false, error: "Execution timed out (10 minutes)" });
      }, 10 * 60 * 1000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        this.abortController?.signal.removeEventListener("abort", abortHandler);

        const prUrlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
        const prNumberMatch = prUrlMatch?.[0].match(/\/pull\/(\d+)/);
        const threadMatch = stdout.match(/Thread URL: (https:\/\/ampcode\.com\/threads\/T-[a-f0-9-]+)/i) 
          || stdout.match(/(T-[a-f0-9-]+)/);

        if (code === 0) {
          resolve({
            success: true,
            prUrl: prUrlMatch?.[0],
            prNumber: prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined,
            threadId: threadMatch?.[1],
          });
        } else {
          const errorSummary = stderr.slice(-500) || stdout.slice(-500) || `Exit code ${code}`;
          resolve({ 
            success: false, 
            error: errorSummary,
            prUrl: prUrlMatch?.[0],
            prNumber: prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined,
          });
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timeout);
        resolve({ success: false, error: error.message });
      });
    });
  }

  private saveRunMeta(meta: RunMeta): void {
    const runsDir = join(this.currentRepoPath, ".wreckit", "sessions", this.sessionId, "runs");
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
    phase?: "implement",
    message?: string,
    data?: Record<string, unknown>
  ): void {
    const event: RunEvent = {
      id: `E-${randomUUID()}`,
      runId,
      kind,
      timestamp: new Date().toISOString(),
      phase: phase as RunEvent["phase"],
      message,
      data,
    };

    if (this.onEvent) {
      this.onEvent(event);
    }

    const runsDir = join(this.currentRepoPath, ".wreckit", "sessions", this.sessionId, "runs", runId);
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
