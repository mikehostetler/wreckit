import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { MobileConfig, SessionMeta, RepoRef, Ticket } from "../shared/contracts.js";
import { MobileConfigSchema } from "../shared/contracts.js";
import { SessionStore } from "./session-store.js";
import { TelegramAdapter } from "./telegram.js";
import { Synthesizer, type SlicerResult } from "./synthesizer.js";
import { Executor } from "../runner/executor.js";
import { AmpExecutor } from "../runner/amp-executor.js";
import { createGitHubProvider } from "../providers/github.js";
import { createLLMClient } from "../providers/llm.js";
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
      onApprove: this.handleApprove.bind(this),
      onStop: this.handleStop.bind(this),
      onMerge: this.handleMerge.bind(this),
      onAsk: this.handleAsk.bind(this),
      onGrep: this.handleGrep.bind(this),
      onDiff: this.handleDiff.bind(this),
      onRevert: this.handleRevert.bind(this),
      onLogs: this.handleLogs.bind(this),
      onImportIssue: this.handleImportIssue.bind(this),
      onImportThread: this.handleImportThread.bind(this),
      onAmpChat: this.handleAmpChat.bind(this),
      onAmpEnd: this.handleAmpEnd.bind(this),
      onNotes: this.handleNotes.bind(this),
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
    
    const synthProvider = this.config.llm.roles.synthesizer;
    const synthModel = synthProvider === "openai" 
      ? this.config.llm.openai?.model 
      : synthProvider === "zai" 
        ? this.config.llm.zai?.model 
        : "unknown";
    
    await this.telegram.sendMessage(
      chatId, 
      `🔄 Synthesizing notes...\n🧠 Model: *${synthProvider}* (${synthModel})`
    );

    this.runSynthesisAsync(sessionId, chatId);
  }

  private async runSynthesisAsync(sessionId: string, chatId: string): Promise<void> {
    try {
      const synthesizer = new Synthesizer(this.config, this.sessionStore);
      const result = await synthesizer.synthesize(sessionId);

      const ticketList = result.tickets.tickets
        .map((t) => {
          const repoTag = t.repo ? ` [${t.repo.owner}/${t.repo.name}]` : "";
          return `• *${t.id}*: ${t.title} (${t.priority})${repoTag}`;
        })
        .join("\n");
      
      const reposInvolved = new Set(
        result.tickets.tickets
          .filter((t) => t.repo)
          .map((t) => `${t.repo!.owner}/${t.repo!.name}`)
      );
      const multiRepo = reposInvolved.size > 1;

      const blockerCount = result.critic.blockingQuestions.filter(
        (q) => q.severity === "blocker"
      ).length;

      let message = `✅ *Synthesis Complete*\n\n`;
      if (multiRepo) {
        message += `📂 *Multi-repo:* ${Array.from(reposInvolved).join(", ")}\n\n`;
      }
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
      message += `Tap below to continue:`;

      const meta = this.sessionStore.getSession(sessionId);
      if (meta) {
        meta.pendingTickets = true;
        this.sessionStore.saveMeta(meta);
      }

      await this.telegram.sendMessageWithButtons(chatId, message, [
        [
          { text: "✅ Approve & Execute", action: "btn_approve" },
          { text: "🔄 Regenerate", action: "btn_regenerate" },
        ],
        [
          { text: "📝 Notes", action: "btn_notes" },
          { text: "❓ Ask", action: "btn_ask" },
          { text: "🔍 Grep", action: "btn_grep" },
        ],
      ]);
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
    await this.telegram.sendMessageWithButtons(
      chatId,
      `⚡ Starting execution of ${ticketsData.tickets.length} ticket(s)...\n\nThis will take several minutes. I'll update you on progress.`,
      [
        [{ text: "🛑 Stop", action: "btn_stop" }, { text: "📊 Status", action: "btn_status" }],
        [{ text: "📄 Diff", action: "btn_diff" }, { text: "📋 Logs", action: "btn_logs" }],
      ]
    );

    this.runExecutionAsync(sessionId, chatId, session.repo, ticketsData.tickets);
  }

  private activeExecutor: Executor | AmpExecutor | null = null;

  private async runExecutionAsync(
    sessionId: string,
    chatId: string,
    repo: RepoRef,
    tickets: Ticket[]
  ): Promise<void> {
    const results: { ticket: Ticket; success: boolean; prUrl?: string; prNumber?: number; error?: string }[] = [];
    const ticketsPath = join(this.repoPath, ".wreckit", "sessions", sessionId, "tickets.json");
    const useAmp = this.config.executor === "amp";
    const executorLabel = useAmp ? "Amp" : "Wreckit";
    const modelLabel = useAmp ? "multi-model (Opus, GPT-5.2, etc.)" : "Agent";
    
    await this.telegram.sendMessage(
      chatId, 
      `🤖 Executor: *${executorLabel}*\n🧠 Models: *${modelLabel}*\n📋 Tickets: ${tickets.length}`
    );

    for (const ticket of tickets) {
      const repoLabel = ticket.repo ? `[${ticket.repo.owner}/${ticket.repo.name}] ` : "";
      await this.telegram.sendMessage(chatId, `🔧 ${repoLabel}Executing: *${ticket.id}* - ${ticket.title}`);

      const executorOptions = {
        config: this.config,
        repoPath: repo.localPath,
        sessionId,
        onLog: (msg: string) => log.info(`[${ticket.id}] ${msg}`),
        onRepoSwitch: async (switchedRepo: RepoRef) => {
          await this.telegram.sendMessage(chatId, `📂 Switched to: ${switchedRepo.owner}/${switchedRepo.name}`);
        },
        onEvent: async (event: { kind: string; phase?: string; data?: { prUrl?: string } }) => {
          if (event.kind === "phase_started") {
            await this.telegram.sendMessage(chatId, `  ▶️ ${event.phase}: starting...`);
          } else if (event.kind === "phase_completed") {
            await this.telegram.sendMessage(chatId, `  ✅ ${event.phase}: done`);
          } else if (event.kind === "pr_opened" && event.data?.prUrl) {
            await this.telegram.sendMessage(chatId, `🔗 PR opened: ${event.data.prUrl}`);
          }
        },
      };

      const executor = useAmp 
        ? new AmpExecutor(executorOptions)
        : new Executor(executorOptions);

      this.activeExecutor = executor;
      const result = await executor.executeTicket(ticket);
      this.activeExecutor = null;

      results.push({
        ticket,
        success: result.success,
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        error: result.error,
      });

      if (result.success && result.prNumber) {
        this.updateTicketWithPR(ticketsPath, ticket.id, result.prUrl, result.prNumber);
      }

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
    }

    this.sessionStore.updateSessionMode(sessionId, "capture");

    if (successful.length > 0 && successful.some((r) => r.prUrl)) {
      await this.telegram.sendMessageWithButtons(chatId, summary, [
        [
          { text: "🔀 Merge PRs", action: "btn_merge" },
          { text: "📄 View Diff", action: "btn_diff" },
        ],
        [
          { text: "❓ Ask", action: "btn_ask" },
          { text: "⏪ Revert", action: "btn_revert_confirm" },
          { text: "📊 Status", action: "btn_status" },
        ],
      ]);
    } else {
      await this.telegram.sendMessage(chatId, summary);
    }
  }

  private async handleStop(sessionId: string, chatId: string): Promise<void> {
    if (this.activeExecutor) {
      this.activeExecutor.stop();
      await this.telegram.sendMessage(chatId, "🛑 Stop signal sent. Execution will halt after current phase.");
    } else {
      await this.telegram.sendMessage(chatId, "ℹ️ No execution currently running.");
    }
  }

  private async handleApprove(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ No active session.");
      return;
    }

    session.pendingTickets = false;
    this.sessionStore.saveMeta(session);

    await this.handleExecute(sessionId, chatId);
  }

  private async handleDiff(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo set.");
      return;
    }

    try {
      const { execSync } = await import("child_process");
      const diff = execSync("git diff --stat HEAD 2>/dev/null || echo 'No changes'", {
        cwd: session.repo.localPath,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });

      if (!diff.trim() || diff.includes("No changes")) {
        await this.telegram.sendMessage(chatId, "📄 No uncommitted changes.");
        return;
      }

      const lines = diff.trim().split("\n");
      const summary = lines.slice(-1)[0];
      const files = lines.slice(0, -1).slice(0, 15).join("\n");

      await this.telegram.sendMessage(chatId, `📄 **Changes:**\n\`\`\`\n${files}\n\`\`\`\n${summary}`);
    } catch (error) {
      log.error(`Diff failed: ${error}`);
      await this.telegram.sendMessage(chatId, "❌ Failed to get diff.");
    }
  }

  private async handleRevert(sessionId: string, chatId: string, target: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo set.");
      return;
    }

    try {
      const { execSync } = await import("child_process");
      const cwd = session.repo.localPath;

      if (target.toLowerCase() === "last") {
        execSync("git reset --hard HEAD~1", { cwd, encoding: "utf-8" });
        await this.telegram.sendMessage(chatId, "⏪ Reverted last commit.");
      } else {
        const ticketId = target.toUpperCase();
        const result = execSync(`git log --oneline --all | grep -i "${ticketId}" | head -1`, {
          cwd,
          encoding: "utf-8",
        });

        if (!result.trim()) {
          await this.telegram.sendMessage(chatId, `❌ No commit found for ${ticketId}.`);
          return;
        }

        const commitHash = result.trim().split(" ")[0];
        execSync(`git revert --no-commit ${commitHash}`, { cwd, encoding: "utf-8" });
        execSync(`git commit -m "Revert ${ticketId}"`, { cwd, encoding: "utf-8" });

        await this.telegram.sendMessage(chatId, `⏪ Reverted ${ticketId} (commit ${commitHash}).`);
      }
    } catch (error) {
      log.error(`Revert failed: ${error}`);
      await this.telegram.sendMessage(chatId, `❌ Revert failed: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  private async handleLogs(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ No active session.");
      return;
    }

    session.verboseLogs = !session.verboseLogs;
    this.sessionStore.saveMeta(session);

    await this.telegram.sendMessage(
      chatId,
      session.verboseLogs ? "📝 Verbose logs **ON** - will show execution details" : "📝 Verbose logs **OFF**"
    );
  }

  private updateTicketWithPR(ticketsPath: string, ticketId: string, prUrl?: string, prNumber?: number): void {
    if (!existsSync(ticketsPath)) return;
    try {
      const data: SlicerResult = JSON.parse(readFileSync(ticketsPath, "utf-8"));
      const ticket = data.tickets.find((t) => t.id === ticketId);
      if (ticket) {
        ticket.prUrl = prUrl;
        ticket.prNumber = prNumber;
        ticket.status = "done";
        writeFileSync(ticketsPath, JSON.stringify(data, null, 2));
        log.info(`Updated ticket ${ticketId} with PR #${prNumber}`);
      }
    } catch (err) {
      log.error(`Failed to update ticket ${ticketId}: ${err}`);
    }
  }

  private getSessionPRNumbers(sessionId: string): number[] {
    const ticketsPath = join(this.repoPath, ".wreckit", "sessions", sessionId, "tickets.json");
    if (!existsSync(ticketsPath)) return [];
    try {
      const data: SlicerResult = JSON.parse(readFileSync(ticketsPath, "utf-8"));
      return data.tickets
        .filter((t) => t.prNumber !== undefined)
        .map((t) => t.prNumber as number);
    } catch {
      return [];
    }
  }

  private async handleMerge(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo configured.");
      return;
    }

    const sessionPRs = this.getSessionPRNumbers(sessionId);
    if (sessionPRs.length === 0) {
      await this.telegram.sendMessage(chatId, "ℹ️ No PRs created in this session to merge.");
      return;
    }

    await this.telegram.sendMessage(chatId, `🔍 Found ${sessionPRs.length} PR(s) from this session: #${sessionPRs.join(", #")}`);

    const github = createGitHubProvider(this.config.github.token);
    const openPRs = await github.listPullRequests(session.repo.owner, session.repo.name);
    const sessionOpenPRs = openPRs.filter((pr) => sessionPRs.includes(pr.number));

    if (sessionOpenPRs.length === 0) {
      await this.telegram.sendMessage(chatId, "ℹ️ All session PRs have already been merged or closed.");
      return;
    }

    let merged = 0;
    let failed = 0;

    for (const pr of sessionOpenPRs) {
      const checks = await github.getPRChecks(session.repo.owner, session.repo.name, pr.number);

      if (checks.state === "success" || checks.state === "error" || checks.total === 0) {
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

  private async handleAsk(sessionId: string, chatId: string, question: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(
        chatId,
        "❌ No repo set. Send `owner/repo` first to target a repository."
      );
      return;
    }

    try {
      const { execSync } = await import("child_process");
      const cwd = session.repo.localPath;

      const escapedQuestion = question.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const result = execSync(
        `amp --mode free --execute "${escapedQuestion}" --no-ide 2>&1`,
        {
          encoding: "utf-8",
          maxBuffer: 2 * 1024 * 1024,
          timeout: 120000,
          cwd,
        }
      );

      const answer = result.trim().slice(0, 4000);
      if (!answer) {
        await this.telegram.sendMessage(chatId, "🤷 Amp returned an empty response. Try rephrasing.");
        return;
      }

      await this.telegram.sendMessage(chatId, answer);
    } catch (error) {
      log.error(`Ask failed: ${error}`);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (errMsg.includes("timed out")) {
        await this.telegram.sendMessage(chatId, "⏱️ Request timed out (2 min). Try a simpler question.");
      } else {
        await this.telegram.sendMessage(chatId, `❌ Failed: ${errMsg.slice(0, 300)}`);
      }
    }
  }

  private gatherRepoContext(repoPath: string, question: string): string {
    const context: string[] = [];
    const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    const readmeFile = this.findFile(repoPath, ["README.md", "readme.md", "Readme.md"]);
    if (readmeFile) {
      context.push(`## README.md\n${readFileSync(readmeFile, "utf-8").slice(0, 2000)}`);
    }

    const packageJson = join(repoPath, "package.json");
    if (existsSync(packageJson)) {
      const pkg = JSON.parse(readFileSync(packageJson, "utf-8"));
      context.push(`## package.json (summary)\nname: ${pkg.name}\ndependencies: ${Object.keys(pkg.dependencies || {}).slice(0, 15).join(", ")}`);
    }

    const srcDirs = ["src", "lib", "app", "packages", "server"];
    for (const dir of srcDirs) {
      const dirPath = join(repoPath, dir);
      if (existsSync(dirPath)) {
        const files = this.listFilesRecursive(dirPath, 3).slice(0, 50);
        const fileList = files.map((f) => relative(repoPath, f)).join("\n");
        context.push(`## ${dir}/ structure\n${fileList}`);
        break;
      }
    }

    const relevantFiles = this.searchFilesForKeywords(repoPath, keywords, 3);
    for (const file of relevantFiles) {
      const relPath = relative(repoPath, file);
      const content = readFileSync(file, "utf-8").slice(0, 1500);
      context.push(`## ${relPath}\n\`\`\`\n${content}\n\`\`\``);
    }

    return context.join("\n\n").slice(0, 12000);
  }

  private findFile(dir: string, names: string[]): string | null {
    for (const name of names) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
    return null;
  }

  private listFilesRecursive(dir: string, maxDepth: number, depth = 0): string[] {
    if (depth > maxDepth || !existsSync(dir)) return [];
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...this.listFilesRecursive(fullPath, maxDepth, depth + 1));
        } else if (stat.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {}
    return files;
  }

  private searchFilesForKeywords(repoPath: string, keywords: string[], maxFiles: number): string[] {
    const matches: string[] = [];
    const codeExts = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"];

    const allFiles = this.listFilesRecursive(repoPath, 4);
    for (const file of allFiles) {
      if (matches.length >= maxFiles) break;
      if (!codeExts.some((ext) => file.endsWith(ext))) continue;

      try {
        const content = readFileSync(file, "utf-8").toLowerCase();
        const filename = file.toLowerCase();
        if (keywords.some((kw) => content.includes(kw) || filename.includes(kw))) {
          matches.push(file);
        }
      } catch {}
    }
    return matches;
  }

  private async handleGrep(sessionId: string, chatId: string, pattern: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo set. Send `owner/repo` first.");
      return;
    }

    try {
      const { execSync } = await import("child_process");
      const result = execSync(
        `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" "${pattern}" . 2>/dev/null | head -30`,
        { cwd: session.repo.localPath, encoding: "utf-8", maxBuffer: 1024 * 1024 }
      );

      if (!result.trim()) {
        await this.telegram.sendMessage(chatId, `🔍 No matches found for \`${pattern}\``);
        return;
      }

      const lines = result.trim().split("\n").slice(0, 20);
      const formatted = lines.map((line) => {
        const [path, ...rest] = line.split(":");
        const lineNum = rest[0];
        const content = rest.slice(1).join(":").trim().slice(0, 80);
        return `\`${path}:${lineNum}\` ${content}`;
      }).join("\n");

      await this.telegram.sendMessage(chatId, `🔍 **Results for** \`${pattern}\`:\n\n${formatted}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("status 1")) {
        await this.telegram.sendMessage(chatId, `🔍 No matches found for \`${pattern}\``);
      } else {
        log.error(`Grep failed: ${error}`);
        await this.telegram.sendMessage(chatId, `❌ Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  private async handleImportIssue(sessionId: string, chatId: string, issueNumber: number): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session || !session.repo) {
      await this.telegram.sendMessage(chatId, "❌ No repo set. Send `owner/repo` first.");
      return;
    }

    try {
      const github = createGitHubProvider(this.config.github.token);
      const issue = await github.getIssue(session.repo.owner, session.repo.name, issueNumber);

      if (!issue) {
        await this.telegram.sendMessage(chatId, `❌ Issue #${issueNumber} not found.`);
        return;
      }

      let context = `## Issue #${issue.number}: ${issue.title}\n\n`;
      context += `**State:** ${issue.state}\n`;
      context += `**Labels:** ${issue.labels.join(", ") || "none"}\n\n`;
      context += `**Description:**\n${issue.body || "_No description_"}\n`;

      if (issue.comments.length > 0) {
        context += `\n**Comments (${issue.comments.length}):**\n`;
        for (const comment of issue.comments.slice(0, 5)) {
          context += `\n> @${comment.author}: ${comment.body.slice(0, 200)}${comment.body.length > 200 ? "..." : ""}\n`;
        }
      }

      this.sessionStore.appendNote(sessionId, context, "text");

      const summary = `✅ **Imported Issue #${issue.number}**\n\n*${issue.title}*\n\n${issue.body?.slice(0, 300) || "No description"}${(issue.body?.length || 0) > 300 ? "..." : ""}\n\n_Added to session notes. Say \`synthesize\` to create tickets._`;
      await this.telegram.sendMessage(chatId, summary);
    } catch (error) {
      log.error(`Import issue failed: ${error}`);
      await this.telegram.sendMessage(chatId, `❌ Failed to import issue: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async handleImportThread(sessionId: string, chatId: string, threadId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ No active session.");
      return;
    }

    try {
      const threadContent = await this.fetchAmpThread(threadId);

      if (!threadContent) {
        await this.telegram.sendMessage(chatId, `❌ Could not fetch thread \`${threadId}\`. Make sure it exists and is accessible.`);
        return;
      }

      this.sessionStore.appendNote(sessionId, `## Amp Thread Context: ${threadId}\n\n${threadContent}`, "text");

      const preview = threadContent.slice(0, 500) + (threadContent.length > 500 ? "..." : "");
      await this.telegram.sendMessage(chatId, `✅ **Imported Amp Thread**\n\n\`${threadId}\`\n\n${preview}\n\n_Added to session notes._`);
    } catch (error) {
      log.error(`Import thread failed: ${error}`);
      await this.telegram.sendMessage(chatId, `❌ Failed to import thread: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async fetchAmpThread(threadId: string): Promise<string | null> {
    try {
      const { execSync } = await import("child_process");
      const markdown = execSync(`amp threads markdown ${threadId}`, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        timeout: 30000,
      });

      if (markdown && markdown.trim()) {
        return markdown.slice(0, 8000);
      }
    } catch (error) {
      log.error(`Failed to fetch Amp thread via CLI: ${error}`);
    }

    return null;
  }

  private async handleAmpChat(
    sessionId: string,
    chatId: string,
    threadId: string,
    message: string
  ): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ No active session.");
      return;
    }

    try {
      await this.telegram.sendMessage(chatId, "🤖 _Amp is thinking..._");

      const { execSync } = await import("child_process");
      const cwd = session.repo?.localPath || this.repoPath;

      const escapedMessage = message.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const result = execSync(
        `amp threads continue ${threadId} --execute "${escapedMessage}" --no-ide --dangerously-allow-all 2>&1`,
        {
          encoding: "utf-8",
          maxBuffer: 5 * 1024 * 1024,
          timeout: 300000,
          cwd,
        }
      );

      const response = result.trim().slice(0, 4000);
      if (response) {
        await this.telegram.sendMessage(chatId, response);
      } else {
        await this.telegram.sendMessage(chatId, "✅ _Amp completed (no text response)_");
      }
    } catch (error) {
      log.error(`Amp chat failed: ${error}`);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      if (errorMsg.includes("timed out")) {
        await this.telegram.sendMessage(chatId, "⏱️ Amp request timed out. The thread may still be processing.");
      } else {
        await this.telegram.sendMessage(chatId, `❌ Amp error: ${errorMsg.slice(0, 500)}`);
      }
    }
  }

  private async handleAmpEnd(sessionId: string, chatId: string): Promise<void> {
    log.info(`Ended Amp chat session for ${sessionId}`);
  }

  private async handleNotes(sessionId: string, chatId: string): Promise<void> {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) {
      await this.telegram.sendMessage(chatId, "❌ No active session.");
      return;
    }

    const notes = this.sessionStore.getNotes(sessionId);
    if (!notes || notes.trim() === "# Session Notes\n\n" || notes.trim() === "# Session Notes") {
      await this.telegram.sendMessage(chatId, "📝 No notes captured yet.");
      return;
    }

    const sections = notes.split(/\n## \[/).slice(1);
    if (sections.length === 0) {
      await this.telegram.sendMessage(chatId, `📝 **Session Notes**\n\n${notes.slice(0, 2000)}`);
      return;
    }

    let summary = `📝 **Session Notes** (${sections.length} entries)\n\n`;
    for (let i = 0; i < Math.min(sections.length, 10); i++) {
      const section = sections[i];
      const headerMatch = section.match(/^([A-Z]+)\]\s+([^\n]+)/);
      const kind = headerMatch?.[1] || "TEXT";
      const timestamp = headerMatch?.[2]?.slice(11, 16) || "";
      const content = section.split("\n").slice(2).join(" ").trim().slice(0, 100);
      summary += `${i + 1}. [${kind}] ${timestamp}: ${content}${content.length >= 100 ? "..." : ""}\n`;
    }

    if (sections.length > 10) {
      summary += `\n_...and ${sections.length - 10} more_`;
    }

    await this.telegram.sendMessage(chatId, summary);
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
