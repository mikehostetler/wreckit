import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { MobileConfig, SessionMeta, RepoRef, Ticket } from "../shared/contracts.js";
import { MobileConfigSchema } from "../shared/contracts.js";
import { SessionStore } from "./session-store.js";
import { TelegramAdapter } from "./telegram.js";
import { Synthesizer, type SlicerResult } from "./synthesizer.js";
import { Executor } from "../runner/executor.js";
import { createGitHubProvider } from "../providers/github.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

const CONFIG_PATH = join(process.env.HOME || "~", ".wreckit", "mobile-config.json");

export interface OrchestratorOptions {
  configPath?: string;
  repoPath?: string;
}

export class Orchestrator {
  private config: MobileConfig;
  private sessionStore: SessionStore;
  private telegram: TelegramAdapter;
  private repoPath: string;

  constructor(options: OrchestratorOptions = {}) {
    this.config = this.loadConfig(options.configPath);
    this.repoPath = options.repoPath || process.cwd();
    this.sessionStore = new SessionStore(this.repoPath);

    this.telegram = new TelegramAdapter({
      config: this.config,
      sessionStore: this.sessionStore,
      onSynthesize: this.handleSynthesize.bind(this),
      onExecute: this.handleExecute.bind(this),
      onStop: this.handleStop.bind(this),
      onMerge: this.handleMerge.bind(this),
    });
  }

  private loadConfig(configPath?: string): MobileConfig {
    const path = configPath || CONFIG_PATH;

    if (!existsSync(path)) {
      throw new Error(
        `Config not found at ${path}. Run 'wreckit onboard' to create it.`
      );
    }

    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);

    const resolved = this.resolveEnvVars(parsed);

    return MobileConfigSchema.parse(resolved);
  }

  private resolveEnvVars(obj: unknown): unknown {
    if (typeof obj === "string") {
      if (obj.startsWith("env:")) {
        const envKey = obj.slice(4);
        const value = process.env[envKey];
        if (!value) {
          log.warn(`Environment variable not set: ${envKey}`);
        }
        return value || "";
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveEnvVars(item));
    }

    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveEnvVars(value);
      }
      return result;
    }

    return obj;
  }

  private async handleSynthesize(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ Session not found");
      return;
    }

    if (!session.repo) {
      await this.telegram.sendMessage(
        chatId,
        "❌ No repo set. Send `owner/repo` first to target a repository."
      );
      return;
    }

    this.sessionStore.updateSessionMode(sessionId, "synthesize");
    await this.telegram.sendMessage(chatId, "🔄 Synthesizing notes... (this may take a minute)");

    this.runSynthesisAsync(sessionId, chatId);
  }

  private async runSynthesisAsync(sessionId: string, chatId: string): Promise<void> {
    try {
      const synthesizer = new Synthesizer(this.config, this.sessionStore);
      const result = await synthesizer.synthesize(sessionId);

      const ticketList = result.tickets.tickets
        .map((t) => `• *${t.id}*: ${t.title} (${t.priority})`)
        .join("\n");

      const blockerCount = result.critic.blockingQuestions.filter(
        (q) => q.severity === "blocker"
      ).length;

      let message = `✅ *Synthesis Complete*\n\n`;
      message += `📋 *${result.tickets.tickets.length} Tickets:*\n${ticketList}\n\n`;

      if (blockerCount > 0) {
        message += `⚠️ *${blockerCount} Blocking Questions:*\n`;
        for (const q of result.critic.blockingQuestions.filter(
          (q) => q.severity === "blocker"
        )) {
          message += `• ${q.question}\n`;
        }
        message += "\n";
      }

      if (result.spec?.mobileNote) {
        message += `${result.spec.mobileNote}\n\n`;
      }
      message += `Say \`go\` or \`execute\` to start implementation.`;

      await this.telegram.sendMessage(chatId, message);
    } catch (error) {
      log.error(`Synthesis failed: ${error}`);
      await this.telegram.sendMessage(
        chatId,
        `❌ Synthesis failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      this.sessionStore.updateSessionMode(sessionId, "capture");
    }
  }

  private async handleExecute(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ Session not found");
      return;
    }

    if (!session.repo) {
      await this.telegram.sendMessage(
        chatId,
        "❌ No repo configured for this session.\n\nSend `owner/repo` to switch to a repo."
      );
      return;
    }

    const ticketsPath = join(this.repoPath, ".wreckit", "sessions", sessionId, "tickets.json");
    if (!existsSync(ticketsPath)) {
      await this.telegram.sendMessage(
        chatId,
        "❌ No tickets found. Run `synthesize` first."
      );
      return;
    }

    let ticketsData: SlicerResult;
    try {
      ticketsData = JSON.parse(readFileSync(ticketsPath, "utf-8"));
    } catch {
      await this.telegram.sendMessage(chatId, "❌ Failed to read tickets.");
      return;
    }

    if (ticketsData.tickets.length === 0) {
      await this.telegram.sendMessage(chatId, "❌ No tickets to execute.");
      return;
    }

    this.sessionStore.updateSessionMode(sessionId, "execute");
    await this.telegram.sendMessage(
      chatId,
      `⚡ Starting execution of ${ticketsData.tickets.length} ticket(s)...\n\nThis will take several minutes. I'll update you on progress.`
    );

    this.runExecutionAsync(sessionId, chatId, session.repo, ticketsData.tickets);
  }

  private activeExecutor: Executor | null = null;

  private async runExecutionAsync(
    sessionId: string,
    chatId: string,
    repo: RepoRef,
    tickets: Ticket[]
  ): Promise<void> {
    const results: { ticket: Ticket; success: boolean; prUrl?: string; error?: string }[] = [];

    for (const ticket of tickets) {
      await this.telegram.sendMessage(chatId, `🔧 Executing: *${ticket.id}* - ${ticket.title}`);

      const executor = new Executor({
        config: this.config,
        repoPath: repo.localPath,
        sessionId,
        onLog: (msg) => log.info(`[${ticket.id}] ${msg}`),
        onEvent: async (event) => {
          if (event.kind === "phase_started") {
            await this.telegram.sendMessage(chatId, `  ▶️ ${event.phase}: starting...`);
          } else if (event.kind === "phase_completed") {
            await this.telegram.sendMessage(chatId, `  ✅ ${event.phase}: done`);
          } else if (event.kind === "pr_opened" && event.data?.prUrl) {
            await this.telegram.sendMessage(chatId, `🔗 PR opened: ${event.data.prUrl}`);
          }
        },
      });

      this.activeExecutor = executor;
      const result = await executor.executeTicket(ticket);
      this.activeExecutor = null;

      results.push({
        ticket,
        success: result.success,
        prUrl: result.prUrl,
        error: result.error,
      });

      if (!result.success) {
        await this.telegram.sendMessage(
          chatId,
          `❌ *${ticket.id}* failed: ${result.error}\n\nContinuing with next ticket...`
        );
      } else if (result.prUrl) {
        const github = createGitHubProvider(this.config.github.token);
        const previewUrl = result.prNumber
          ? await github.findPreviewUrl(repo.owner, repo.name, result.prNumber)
          : null;

        if (previewUrl) {
          await this.telegram.sendMessage(chatId, `🌐 Preview: ${previewUrl}`);
        }
      }
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    let summary = `\n🏁 *Execution Complete*\n\n`;
    summary += `✅ ${successful.length} succeeded\n`;
    if (failed.length > 0) {
      summary += `❌ ${failed.length} failed\n`;
    }

    if (successful.length > 0 && successful.some((r) => r.prUrl)) {
      summary += `\n*PRs:*\n`;
      for (const r of successful.filter((r) => r.prUrl)) {
        summary += `• ${r.ticket.id}: ${r.prUrl}\n`;
      }
      summary += `\nSay \`merge\` to merge when checks pass.`;
    }

    await this.telegram.sendMessage(chatId, summary);
    this.sessionStore.updateSessionMode(sessionId, "capture");
  }

  private async handleStop(sessionId: string, chatId: string): Promise<void> {
    if (this.activeExecutor) {
      this.activeExecutor.stop();
      await this.telegram.sendMessage(chatId, "🛑 Stop signal sent. Execution will halt after current phase.");
    } else {
      await this.telegram.sendMessage(chatId, "ℹ️ No execution currently running.");
    }
  }

  private async handleMerge(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo configured.");
      return;
    }

    const ticketsPath = join(this.repoPath, ".wreckit", "sessions", sessionId, "tickets.json");
    if (!existsSync(ticketsPath)) {
      await this.telegram.sendMessage(chatId, "❌ No tickets found.");
      return;
    }

    const github = createGitHubProvider(this.config.github.token);
    const openPRs = await github.listPullRequests(session.repo.owner, session.repo.name);

    if (openPRs.length === 0) {
      await this.telegram.sendMessage(chatId, "ℹ️ No open PRs found for this repo.");
      return;
    }

    let merged = 0;
    let failed = 0;

    for (const pr of openPRs) {
      const checks = await github.getPRChecks(session.repo.owner, session.repo.name, pr.number);

      if (checks.state === "success") {
        const success = await github.mergePullRequest(
          session.repo.owner,
          session.repo.name,
          pr.number,
          "squash"
        );

        if (success) {
          await this.telegram.sendMessage(chatId, `✅ Merged: #${pr.number} - ${pr.title}`);
          merged++;
        } else {
          await this.telegram.sendMessage(chatId, `❌ Failed to merge #${pr.number}`);
          failed++;
        }
      } else if (checks.state === "pending") {
        await this.telegram.sendMessage(
          chatId,
          `⏳ #${pr.number}: Checks still running (${checks.pending} pending)`
        );
      } else {
        await this.telegram.sendMessage(
          chatId,
          `❌ #${pr.number}: Checks failed (${checks.failed} failed)`
        );
        failed++;
      }
    }

    await this.telegram.sendMessage(
      chatId,
      `\n🏁 Merge complete: ${merged} merged, ${failed} failed/blocked`
    );
  }

  async start(): Promise<void> {
    log.info(`Starting orchestrator at ${this.repoPath}`);

    const sessionsDir = join(this.repoPath, ".wreckit", "sessions");
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    await this.telegram.start();

    log.info("Orchestrator started successfully");
    log.info(`Allowed Telegram users: ${this.config.telegram.allowedUserIds.join(", ")}`);
    log.info(`Configured repos: ${this.config.repos.map((r) => `${r.owner}/${r.name}`).join(", ")}`);
  }

  async stop(): Promise<void> {
    log.info("Stopping orchestrator");
    await this.telegram.stop();
  }

  getConfig(): MobileConfig {
    return this.config;
  }

  getSessionStore(): SessionStore {
    return this.sessionStore;
  }
}
