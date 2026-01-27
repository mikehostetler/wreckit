import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { MobileConfig, SessionMeta, RepoRef } from "../shared/contracts.js";
import { MobileConfigSchema } from "../shared/contracts.js";
import { SessionStore } from "./session-store.js";
import { TelegramAdapter } from "./telegram.js";
import { Synthesizer } from "./synthesizer.js";
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

    this.sessionStore.updateSessionMode(sessionId, "execute");

    await this.telegram.sendMessage(
      chatId,
      "⚠️ Execute pipeline not yet implemented (Milestone 3).\n\nSession ready for execution."
    );
  }

  private async handleStop(sessionId: string, chatId: string): Promise<void> {
    await this.telegram.sendMessage(
      chatId,
      "⚠️ Stop not yet implemented (Milestone 6)."
    );
  }

  private async handleMerge(sessionId: string, chatId: string): Promise<void> {
    await this.telegram.sendMessage(
      chatId,
      "⚠️ Merge not yet implemented (Milestone 5)."
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
