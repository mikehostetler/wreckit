import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { randomUUID } from "crypto";
import type { MobileConfig, ChatEvent, NoteKind, RepoRef } from "../shared/contracts.js";
import { SessionStore } from "./session-store.js";
import { classifyIntent, getHelpMessage } from "./intent-classifier.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export interface TelegramAdapterOptions {
  config: MobileConfig;
  sessionStore: SessionStore;
  onSynthesize?: (sessionId: string, chatId: string) => Promise<void>;
  onExecute?: (sessionId: string, chatId: string) => Promise<void>;
  onStop?: (sessionId: string, chatId: string) => Promise<void>;
  onMerge?: (sessionId: string, chatId: string) => Promise<void>;
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

    this.bot.command("start", async (ctx) => {
      const userId = String(ctx.from.id);
      const chatId = String(ctx.chat.id);
      const session = this.sessionStore.getOrCreateSession(userId, chatId);
      await ctx.reply(
        `🚀 Welcome to Wreckit Mobile!\n\nSession: \`${session.id}\`\n\nSend notes, screenshots, or voice messages to capture ideas.\n\nType \`help\` for commands.`,
        { parse_mode: "Markdown" }
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

    const intent = classifyIntent(text, this.configuredRepoNames);
    log.info(`Message received: ${intent} from ${userId}`);

    const session = this.sessionStore.getOrCreateSession(userId, chatId);

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
        if (session.mode !== "synthesize" && session.mode !== "capture") {
          await ctx.reply("⚠️ Please synthesize notes first before executing.");
          return;
        }
        await ctx.reply("⚡ Starting execution...");
        if (this.options.onExecute) {
          await this.options.onExecute(session.id, chatId);
        } else {
          await ctx.reply("⚠️ Execute not implemented yet (Milestone 3)");
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

      case "CAPTURE_NOTE":
      default: {
        this.sessionStore.appendNote(session.id, text, "text");
        await ctx.reply(`📝 Noted (${session.noteCount + 1} notes in session)`);
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

  private async handleVoice(ctx: Context & { message: { voice: { file_id: string } } }): Promise<void> {
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

      await ctx.reply(`🎤 Voice message saved (${session.noteCount + 1} notes)\n_Transcription coming in Milestone 2_`, {
        parse_mode: "Markdown",
      });
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

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, text, { parse_mode: "Markdown" });
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
