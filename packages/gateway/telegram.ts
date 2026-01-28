import { Telegraf, Context, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { randomUUID } from "crypto";
import type { MobileConfig, ChatEvent, NoteKind, RepoRef } from "../shared/contracts.js";
import { SessionStore } from "./session-store.js";
import { classifyIntent, getHelpMessage } from "./intent-classifier.js";
import { createLogger } from "../../src/logging.js";
import { transcribeVoice } from "../providers/whisper.js";

const log = createLogger({ verbose: true });

export interface TelegramAdapterOptions {
  config: MobileConfig;
  sessionStore: SessionStore;
  onSynthesize?: (sessionId: string, chatId: string) => Promise<void>;
  onExecute?: (sessionId: string, chatId: string) => Promise<void>;
  onApprove?: (sessionId: string, chatId: string) => Promise<void>;
  onStop?: (sessionId: string, chatId: string) => Promise<void>;
  onMerge?: (sessionId: string, chatId: string) => Promise<void>;
  onAsk?: (sessionId: string, chatId: string, question: string) => Promise<void>;
  onGrep?: (sessionId: string, chatId: string, pattern: string) => Promise<void>;
  onDiff?: (sessionId: string, chatId: string) => Promise<void>;
  onRevert?: (sessionId: string, chatId: string, target: string) => Promise<void>;
  onLogs?: (sessionId: string, chatId: string) => Promise<void>;
  onImportIssue?: (sessionId: string, chatId: string, issueNumber: number) => Promise<void>;
  onImportThread?: (sessionId: string, chatId: string, threadId: string) => Promise<void>;
  onAmpChat?: (sessionId: string, chatId: string, threadId: string, message: string) => Promise<void>;
  onAmpEnd?: (sessionId: string, chatId: string) => Promise<void>;
  onNotes?: (sessionId: string, chatId: string) => Promise<void>;
}

export class TelegramAdapter {
  private bot: Telegraf;
  private config: MobileConfig;
  private sessionStore: SessionStore;
  private options: TelegramAdapterOptions;
  private configuredRepoNames: string[];

  constructor(options: TelegramAdapterOptions) {
    this.config = options.config;
    this.sessionStore = options.sessionStore;
    this.options = options;
    this.bot = new Telegraf(this.config.telegram.botToken);
    this.configuredRepoNames = this.config.repos.map((r) => `${r.owner}/${r.name}`);

    this.setupHandlers();
  }

  private isAllowedUser(userId: number): boolean {
    return this.config.telegram.allowedUserIds.includes(userId);
  }

  private setupHandlers(): void {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.isAllowedUser(userId)) {
        log.warn(`Unauthorized user attempted access: ${userId}`);
        await ctx.reply("⛔ You are not authorized to use this bot.");
        return;
      }
      return next();
    });

    this.setupCallbackHandlers();

    this.bot.command("start", async (ctx) => {
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat.id);
      const session = this.sessionStore.getOrCreateSession(userId, chatId);
      const repoName = session.repo ? `${session.repo.owner}/${session.repo.name}` : "not set";
      await ctx.reply(
        `🚀 *WreckitGo*\n\n📂 Repo: \`${repoName}\`\n📝 Notes: ${session.noteCount}\n\nSend notes, screenshots, or voice to capture ideas.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "📊 Status", callback_data: "btn_status" },
                { text: "📝 Notes", callback_data: "btn_notes" },
              ],
              [
                { text: "📥 Import", callback_data: "btn_import" },
                { text: "🔧 Tools", callback_data: "btn_tools" },
              ],
              [
                { text: "❓ Help", callback_data: "btn_help" },
              ],
            ],
          },
        }
      );
    });

    this.bot.command("help", async (ctx) => {
      await ctx.reply(getHelpMessage(), { parse_mode: "Markdown" });
    });

    this.bot.command("status", async (ctx) => {
      await this.handleStatus(ctx);
    });

    this.bot.on(message("text"), async (ctx) => {
      await this.handleTextMessage(ctx, ctx.message.text);
    });

    this.bot.on(message("photo"), async (ctx) => {
      await this.handlePhoto(ctx);
    });

    this.bot.on(message("voice"), async (ctx) => {
      await this.handleVoice(ctx);
    });

    this.bot.on(message("document"), async (ctx) => {
      await this.handleDocument(ctx);
    });
  }

  private async handleTextMessage(ctx: Context, text: string): Promise<void> {
    const userId = String(ctx.from!.id);
    const chatId = String(ctx.chat!.id);
    const messageId = String(ctx.message!.message_id);

    const session = this.sessionStore.getOrCreateSession(userId, chatId);

    if (session.activeAmpThread && !text.match(/^(end chat|exit amp|stop amp|done|\/end)$/i)) {
      log.info(`Forwarding to Amp thread ${session.activeAmpThread}`);
      if (this.options.onAmpChat) {
        await this.options.onAmpChat(session.id, chatId, session.activeAmpThread, text);
      }
      return;
    }

    const intent = classifyIntent(text, this.configuredRepoNames);
    log.info(`Message received: ${intent} from ${userId}`);

    const event: ChatEvent = {
      id: `E-${randomUUID()}`,
      ref: {
        platform: "telegram",
        chatId,
        messageId,
        userId,
        timestamp: new Date().toISOString(),
      },
      kind: "text",
      text,
      intent,
    };
    this.sessionStore.appendEvent(session.id, event);

    switch (intent) {
      case "START_SESSION": {
        const newSession = this.sessionStore.createSession(userId, chatId);
        await ctx.reply(`🆕 New session started: \`${newSession.id}\``, { parse_mode: "Markdown" });
        break;
      }

      case "SYNTHESIZE": {
        await ctx.reply("🔄 Synthesizing notes into tickets...");
        if (this.options.onSynthesize) {
          await this.options.onSynthesize(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Synthesize not implemented yet (Milestone 2)");
        }
        break;
      }

      case "EXECUTE": {
        if (session.pendingTickets) {
          await ctx.reply("📋 You have pending tickets. Say `approve` to confirm and execute, or `synthesize` to regenerate.");
          return;
        }
        if (session.mode !== "synthesize" && session.mode !== "capture") {
          await ctx.reply("⚠️ Please synthesize notes first before executing.");
          return;
        }
        await ctx.reply("⚡ Starting execution...");
        if (this.options.onExecute) {
          await this.options.onExecute(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Execute not implemented yet");
        }
        break;
      }

      case "APPROVE": {
        if (!session.pendingTickets) {
          await ctx.reply("ℹ️ No pending tickets to approve. Run `synthesize` first.");
          return;
        }
        await ctx.reply("✅ Tickets approved. Starting execution...");
        if (this.options.onApprove) {
          await this.options.onApprove(session.id, chatId);
        }
        break;
      }

      case "STATUS": {
        await this.handleStatus(ctx);
        break;
      }

      case "STOP": {
        await ctx.reply("🛑 Stopping execution...");
        if (this.options.onStop) {
          await this.options.onStop(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Stop not implemented yet (Milestone 6)");
        }
        break;
      }

      case "MERGE": {
        await ctx.reply("🔀 Checking PR status for merge...");
        if (this.options.onMerge) {
          await this.options.onMerge(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Merge not implemented yet (Milestone 5)");
        }
        break;
      }

      case "SWITCH_REPO": {
        const repo = this.config.repos.find(
          (r) => `${r.owner}/${r.name}`.toLowerCase() === text.trim().toLowerCase()
        );
        if (repo) {
          this.sessionStore.setSessionRepo(session.id, repo);
          await ctx.reply(`📂 Switched to repo: \`${repo.owner}/${repo.name}\``, {
            parse_mode: "Markdown",
          });
        } else {
          await ctx.reply("❌ Repo not found in config.");
        }
        break;
      }

      case "HELP": {
        await ctx.reply(getHelpMessage(), { parse_mode: "Markdown" });
        break;
      }

      case "NOTES": {
        if (this.options.onNotes) {
          await this.options.onNotes(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Notes not implemented yet");
        }
        break;
      }

      case "CLEAR_NOTES": {
        await this.sendMessageWithButtons(
          chatId,
          `⚠️ *Clear all ${session.noteCount} notes?*\n\nThis cannot be undone.`,
          [
            [
              { text: "✅ Yes, Clear", action: "btn_clear_notes_confirm" },
              { text: "❌ Cancel", action: "btn_close" },
            ],
          ]
        );
        break;
      }

      case "ASK": {
        let question = text.replace(/^(ask|question|q:|\?)\s+/i, "").trim();
        if (!question || question === text) {
          question = text;
        }
        await ctx.reply("🔍 Searching the repo...");
        if (this.options.onAsk) {
          await this.options.onAsk(session.id, chatId, question);
        } else {
          await ctx.reply("⚠️ Ask not implemented yet");
        }
        break;
      }

      case "GREP": {
        const pattern = text.replace(/^(grep|search|find|\/\/)\s*/i, "").trim();
        if (!pattern) {
          await ctx.reply("🔍 Usage: `grep <pattern>`", { parse_mode: "Markdown" });
          return;
        }
        await ctx.reply(`🔍 Searching for \`${pattern}\`...`, { parse_mode: "Markdown" });
        if (this.options.onGrep) {
          await this.options.onGrep(session.id, chatId, pattern);
        } else {
          await ctx.reply("⚠️ Grep not implemented yet");
        }
        break;
      }

      case "DIFF": {
        await ctx.reply("📄 Checking for changes...");
        if (this.options.onDiff) {
          await this.options.onDiff(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Diff not implemented yet");
        }
        break;
      }

      case "REVERT": {
        const revertMatch = text.match(/revert\s+(T-\d+|last)/i) || text.match(/undo\s+(T-\d+|last)/i);
        if (!revertMatch) {
          await ctx.reply("❓ Usage: `revert T-001` or `revert last`", { parse_mode: "Markdown" });
          return;
        }
        const target = revertMatch[1];
        await ctx.reply(`⏪ Reverting ${target}...`);
        if (this.options.onRevert) {
          await this.options.onRevert(session.id, chatId, target);
        } else {
          await ctx.reply("⚠️ Revert not implemented yet");
        }
        break;
      }

      case "LOGS": {
        if (this.options.onLogs) {
          await this.options.onLogs(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Logs toggle not implemented yet");
        }
        break;
      }

      case "IMPORT_ISSUE": {
        const issueMatch = text.match(/#?(\d+)/);
        if (!issueMatch) {
          await ctx.reply("❓ Usage: `issue #123`", { parse_mode: "Markdown" });
          return;
        }
        const issueNumber = parseInt(issueMatch[1], 10);
        await ctx.reply(`📥 Importing issue #${issueNumber}...`);
        if (this.options.onImportIssue) {
          await this.options.onImportIssue(session.id, chatId, issueNumber);
        } else {
          await ctx.reply("⚠️ Issue import not implemented yet");
        }
        break;
      }

      case "IMPORT_THREAD": {
        const threadMatch = text.match(/T-[a-f0-9-]+/i);
        if (!threadMatch) {
          await ctx.reply("❓ Usage: `@T-xxx` or `context T-xxx`", { parse_mode: "Markdown" });
          return;
        }
        const threadId = threadMatch[0];
        await ctx.reply(`📥 Importing Amp thread \`${threadId}\`...`, { parse_mode: "Markdown" });
        if (this.options.onImportThread) {
          await this.options.onImportThread(session.id, chatId, threadId);
        } else {
          await ctx.reply("⚠️ Thread import not implemented yet");
        }
        break;
      }

      case "AMP_CHAT": {
        const threadMatch = text.match(/T-[a-f0-9-]+/i);
        if (!threadMatch) {
          await ctx.reply("❓ Usage: `amp threads continue T-xxx` or `@T-xxx <message>`", { parse_mode: "Markdown" });
          return;
        }
        const threadId = threadMatch[0];
        const message = text
          .replace(/^amp\s+threads\s+continue\s+T-[a-f0-9-]+\s*/i, "")
          .replace(/^(amp|chat|continue)\s+@?T-[a-f0-9-]+\s*/i, "")
          .replace(/^@T-[a-f0-9-]+\s*/i, "").trim();

        this.sessionStore.setActiveAmpThread(session.id, threadId);
        await ctx.reply(`🔗 **Connected to Amp thread**\n\n\`${threadId}\`\n\nAll messages will now go to Amp. Say \`/end\` to disconnect.`, { parse_mode: "Markdown" });

        if (message && this.options.onAmpChat) {
          await this.options.onAmpChat(session.id, chatId, threadId, message);
        }
        break;
      }

      case "AMP_END": {
        if (session.activeAmpThread) {
          const threadId = session.activeAmpThread;
          this.sessionStore.setActiveAmpThread(session.id, undefined);
          await ctx.reply(`🔌 Disconnected from Amp thread \`${threadId}\`\n\nBack to WreckitGo mode.`, { parse_mode: "Markdown" });
          if (this.options.onAmpEnd) {
            await this.options.onAmpEnd(session.id, chatId);
          }
        } else {
          await ctx.reply("ℹ️ No active Amp chat session.");
        }
        break;
      }

      case "CAPTURE_NOTE":
      default: {
        this.sessionStore.appendNote(session.id, text, "text");
        const noteCount = session.noteCount + 1;
        if (noteCount >= 3 && noteCount % 3 === 0) {
          await this.sendMessageWithButtons(
            chatId,
            `📝 Noted (${noteCount} notes). Ready to synthesize?`,
            [
              [
                { text: "🔄 Synthesize", action: "btn_synthesize" },
                { text: "📥 Import", action: "btn_import" },
              ],
              [
                { text: "📝 Notes", action: "btn_notes" },
                { text: "📊 Status", action: "btn_status" },
                { text: "🔧 Tools", action: "btn_tools" },
              ],
            ]
          );
        } else if (noteCount === 1) {
          await this.sendMessageWithButtons(
            chatId,
            `📝 Noted (${noteCount} note). Add more notes, then synthesize.`,
            [
              [
                { text: "📥 Import Issue", action: "btn_import_issue" },
                { text: "📥 Import Thread", action: "btn_import_thread" },
              ],
            ]
          );
        } else {
          await ctx.reply(`📝 Noted (${noteCount} notes in session)`);
        }
        break;
      }
    }
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const userId = String(ctx.from!.id);
    const chatId = String(ctx.chat!.id);

    const session = this.sessionStore.findActiveSession(userId, chatId);
    if (!session) {
      await ctx.reply("No active session. Send a message to start one.");
      return;
    }

    const repoInfo = session.repo
      ? `📂 Repo: \`${session.repo.owner}/${session.repo.name}\``
      : "📂 Repo: _not set_";

    const status = `📊 **Session Status**

🆔 ID: \`${session.id}\`
📋 Mode: \`${session.mode}\`
${repoInfo}
📝 Notes: ${session.noteCount}
🕐 Last Activity: ${session.lastActivityAt || session.createdAt}`;

    await ctx.reply(status, { parse_mode: "Markdown" });
  }

  private async handlePhoto(ctx: Context & { message: { photo: { file_id: string }[] } }): Promise<void> {
    const userId = String(ctx.from!.id);
    const chatId = String(ctx.chat!.id);
    const session = this.sessionStore.getOrCreateSession(userId, chatId);

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `screenshot_${Date.now()}.jpg`;

      this.sessionStore.saveAttachment(session.id, filename, buffer, "screenshot", fileId, "image/jpeg");

      const caption = (ctx.message as { caption?: string }).caption;
      if (caption) {
        this.sessionStore.appendNote(session.id, `Screenshot note: ${caption}`, "text");
      }

      await ctx.reply(`📸 Screenshot saved (${session.noteCount + 1} notes)`);
    } catch (error) {
      log.error(`Failed to save photo: ${error}`);
      await ctx.reply("❌ Failed to save screenshot");
    }
  }

  private async handleVoice(ctx: Context & { message: { voice: { file_id: string; duration: number } } }): Promise<void> {
    const userId = String(ctx.from!.id);
    const chatId = String(ctx.chat!.id);
    const session = this.sessionStore.getOrCreateSession(userId, chatId);

    const voice = ctx.message.voice;
    const fileId = voice.file_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = `voice_${Date.now()}.ogg`;

      this.sessionStore.saveAttachment(session.id, filename, buffer, "voice", fileId, "audio/ogg");

      await ctx.reply(`🎤 Voice saved (${voice.duration}s). Transcribing...`);

      const transcription = await transcribeVoice(buffer, this.config);
      if (transcription) {
        this.sessionStore.appendNote(session.id, `🎤 Voice note: ${transcription}`, "voice");
        await ctx.reply(`📝 Transcribed:\n\n"${transcription}"`);
      } else {
        await ctx.reply(`🎤 Voice saved (transcription unavailable - add OpenAI key to config)`);
      }
    } catch (error) {
      log.error(`Failed to save voice: ${error}`);
      await ctx.reply("❌ Failed to save voice message");
    }
  }

  private async handleDocument(ctx: Context & { message: { document: { file_id: string; file_name?: string; mime_type?: string } } }): Promise<void> {
    const userId = String(ctx.from!.id);
    const chatId = String(ctx.chat!.id);
    const session = this.sessionStore.getOrCreateSession(userId, chatId);

    const doc = ctx.message.document;
    const fileId = doc.file_id;
    const filename = doc.file_name || `file_${Date.now()}`;
    const mimeType = doc.mime_type;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      this.sessionStore.saveAttachment(session.id, filename, buffer, "file", fileId, mimeType);

      await ctx.reply(`📎 File saved: ${filename} (${session.noteCount + 1} notes)`);
    } catch (error) {
      log.error(`Failed to save document: ${error}`);
      await ctx.reply("❌ Failed to save document");
    }
  }

  async sendMessage(chatId: string, text: string, useMarkdown = true): Promise<void> {
    if (useMarkdown) {
      try {
        await this.bot.telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
      } catch (error) {
        const escaped = this.escapeMarkdown(text);
        try {
          await this.bot.telegram.sendMessage(chatId, escaped, { parse_mode: "Markdown" });
        } catch {
          await this.bot.telegram.sendMessage(chatId, text);
        }
      }
    } else {
      await this.bot.telegram.sendMessage(chatId, text);
    }
  }

  async sendMessageWithButtons(
    chatId: string,
    text: string,
    buttons: Array<Array<{ text: string; action: string }>>
  ): Promise<void> {
    const keyboard = buttons.map((row) =>
      row.map((b) => Markup.button.callback(b.text, b.action))
    );
    try {
      await this.bot.telegram.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      log.error(`Button message failed: ${err}`);
      await this.bot.telegram.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: keyboard },
      });
    }
  }

  private getUtilityButtons(): Array<{ text: string; action: string }> {
    return [
      { text: "📝 Notes", action: "btn_notes" },
      { text: "📊 Status", action: "btn_status" },
      { text: "📄 Diff", action: "btn_diff" },
      { text: "🔧 Tools", action: "btn_tools" },
    ];
  }

  private escapeMarkdown(text: string): string {
    return text
      .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1")
      .replace(/\\/g, "");
  }

  private setupCallbackHandlers(): void {
    this.bot.action("btn_synthesize", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onSynthesize) {
        await ctx.reply("🔄 Synthesizing...");
        await this.options.onSynthesize(session.id, chatId);
      }
    });

    this.bot.action("btn_approve", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onApprove) {
        await ctx.reply("✅ Approved. Executing...");
        await this.options.onApprove(session.id, chatId);
      }
    });

    this.bot.action("btn_regenerate", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onSynthesize) {
        await ctx.reply("🔄 Regenerating tickets...");
        await this.options.onSynthesize(session.id, chatId);
      }
    });

    this.bot.action("btn_merge", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onMerge) {
        await ctx.reply("🔀 Merging PRs...");
        await this.options.onMerge(session.id, chatId);
      }
    });

    this.bot.action("btn_diff", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onDiff) {
        await this.options.onDiff(session.id, chatId);
      }
    });

    this.bot.action("btn_status", async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleStatus(ctx);
    });

    this.bot.action("btn_notes", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onNotes) {
        await this.options.onNotes(session.id, chatId);
      }
    });

    this.bot.action("btn_stop", async (ctx) => {
      await ctx.answerCbQuery("Stopping...");
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onStop) {
        await this.options.onStop(session.id, chatId);
      }
    });

    this.bot.action("btn_logs", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onLogs) {
        await this.options.onLogs(session.id, chatId);
      }
    });

    this.bot.action("btn_tools", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("🔧 *Tools*", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "❓ Ask AI", callback_data: "btn_ask" },
              { text: "🔍 Grep", callback_data: "btn_grep" },
            ],
            [
              { text: "📋 Logs", callback_data: "btn_logs" },
              { text: "⏪ Revert", callback_data: "btn_revert_menu" },
            ],
            [
              { text: "🗑️ Clear Notes", callback_data: "btn_clear_notes" },
              { text: "🔗 Amp Chat", callback_data: "btn_amp_chat" },
            ],
            [
              { text: "❌ Close", callback_data: "btn_close" },
            ],
          ],
        },
      });
    });

    this.bot.action("btn_import", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("📥 *Import*", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🐙 GitHub Issue", callback_data: "btn_import_issue" },
              { text: "💬 Amp Thread", callback_data: "btn_import_thread" },
            ],
            [{ text: "❌ Close", callback_data: "btn_close" }],
          ],
        },
      });
    });

    this.bot.action("btn_import_issue", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("Enter issue number (e.g. `#123` or `123`):", { parse_mode: "Markdown" });
    });

    this.bot.action("btn_import_thread", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("Enter Amp thread ID (e.g. `@T-xxx`):", { parse_mode: "Markdown" });
    });

    this.bot.action("btn_ask", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("❓ What would you like to ask about the codebase?");
    });

    this.bot.action("btn_grep", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("🔍 Enter search pattern:");
    });

    this.bot.action("btn_amp_chat", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("🔗 Enter Amp thread ID to connect (e.g. `T-xxx`):", { parse_mode: "Markdown" });
    });

    this.bot.action("btn_revert_menu", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("⏪ *Revert Options*", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⏪ Revert Last Commit", callback_data: "btn_revert_last" },
            ],
            [
              { text: "🎯 Revert Specific Ticket", callback_data: "btn_revert_ticket" },
            ],
            [{ text: "❌ Cancel", callback_data: "btn_close" }],
          ],
        },
      });
    });

    this.bot.action("btn_revert_confirm", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("⚠️ *Confirm Revert*\n\nThis will undo the last changes.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, Revert", callback_data: "btn_revert_last" },
              { text: "❌ Cancel", callback_data: "btn_close" },
            ],
          ],
        },
      });
    });

    this.bot.action("btn_revert_last", async (ctx) => {
      await ctx.answerCbQuery("Reverting...");
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session && this.options.onRevert) {
        await this.options.onRevert(session.id, chatId, "last");
      }
    });

    this.bot.action("btn_revert_ticket", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("Enter ticket ID to revert (e.g. `T-001`):", { parse_mode: "Markdown" });
    });

    this.bot.action("btn_merge_confirm", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply("⚠️ *Confirm Merge*\n\nThis will merge all session PRs to the target branch.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, Merge", callback_data: "btn_merge" },
              { text: "❌ Cancel", callback_data: "btn_close" },
            ],
          ],
        },
      });
    });

    this.bot.action("btn_close", async (ctx) => {
      await ctx.answerCbQuery();
      try {
        await ctx.deleteMessage();
      } catch {
        await ctx.reply("✓");
      }
    });

    this.bot.action("btn_help", async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(getHelpMessage(), { parse_mode: "Markdown" });
    });

    this.bot.action("btn_clear_notes_confirm", async (ctx) => {
      await ctx.answerCbQuery("Clearing notes...");
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (session) {
        const cleared = this.sessionStore.clearNotes(session.id);
        if (cleared) {
          await ctx.reply("🗑️ Notes cleared. Ready to capture new ideas.");
        } else {
          await ctx.reply("❌ Failed to clear notes.");
        }
      }
    });

    this.bot.action("btn_clear_notes", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (!session) return;
      await ctx.reply(`⚠️ *Clear all ${session.noteCount} notes?*`, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Yes, Clear", callback_data: "btn_clear_notes_confirm" },
              { text: "❌ Cancel", callback_data: "btn_close" },
            ],
          ],
        },
      });
    });

    this.bot.action("btn_home", async (ctx) => {
      await ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat!.id);
      const session = this.sessionStore.findActiveSession(userId, chatId);
      if (!session) {
        await ctx.reply("No active session.");
        return;
      }
      const repoName = session.repo ? `${session.repo.owner}/${session.repo.name}` : "not set";
      await ctx.reply(
        `🏠 *Workspace*\n\n📂 Repo: \`${repoName}\`\n📝 Notes: ${session.noteCount}\n🔄 Mode: ${session.mode}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Synthesize", callback_data: "btn_synthesize" },
                { text: "📥 Import", callback_data: "btn_import" },
              ],
              [
                { text: "📝 Notes", callback_data: "btn_notes" },
                { text: "📊 Status", callback_data: "btn_status" },
                { text: "🔧 Tools", callback_data: "btn_tools" },
              ],
            ],
          },
        }
      );
    });
  }

  async start(): Promise<void> {
    log.info("Starting Telegram bot (polling mode)...");
    await this.bot.launch();
    log.info("Telegram bot started successfully");
  }

  async stop(): Promise<void> {
    log.info("Stopping Telegram bot...");
    this.bot.stop("SIGTERM");
  }
}
