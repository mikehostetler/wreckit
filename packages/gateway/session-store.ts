import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { SessionMeta, Attachment, NoteKind, ChatEvent } from "../shared/contracts.js";
import { SessionMetaSchema, AttachmentSchema } from "../shared/contracts.js";

const WRECKIT_DIR = ".wreckit";
const SESSIONS_DIR = "sessions";

export class SessionStore {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const sessionsPath = this.getSessionsPath();
    if (!existsSync(sessionsPath)) {
      mkdirSync(sessionsPath, { recursive: true });
    }
  }

  private getSessionsPath(): string {
    return join(this.basePath, WRECKIT_DIR, SESSIONS_DIR);
  }

  private getSessionPath(sessionId: string): string {
    return join(this.getSessionsPath(), sessionId);
  }

  private getMetaPath(sessionId: string): string {
    return join(this.getSessionPath(sessionId), "meta.json");
  }

  private getNotesPath(sessionId: string): string {
    return join(this.getSessionPath(sessionId), "notes.md");
  }

  private getAttachmentsPath(sessionId: string): string {
    return join(this.getSessionPath(sessionId), "attachments");
  }

  private getEventsPath(sessionId: string): string {
    return join(this.getSessionPath(sessionId), "events.json");
  }

  createSession(userId: string, chatId: string): SessionMeta {
    const sessionId = `S-${randomUUID()}`;
    const now = new Date().toISOString();

    const meta: SessionMeta = {
      id: sessionId,
      mode: "capture",
      createdAt: now,
      updatedAt: now,
      noteCount: 0,
      userId,
      chatId,
    };

    const sessionPath = this.getSessionPath(sessionId);
    mkdirSync(sessionPath, { recursive: true });
    mkdirSync(this.getAttachmentsPath(sessionId), { recursive: true });

    this.saveMeta(meta);
    writeFileSync(this.getNotesPath(sessionId), "# Session Notes\n\n");
    writeFileSync(this.getEventsPath(sessionId), "[]");

    return meta;
  }

  getSession(sessionId: string): SessionMeta | null {
    const metaPath = this.getMetaPath(sessionId);
    if (!existsSync(metaPath)) {
      return null;
    }

    try {
      const data = JSON.parse(readFileSync(metaPath, "utf-8"));
      return SessionMetaSchema.parse(data);
    } catch {
      return null;
    }
  }

  findActiveSession(userId: string, chatId: string): SessionMeta | null {
    const sessionsPath = this.getSessionsPath();
    if (!existsSync(sessionsPath)) {
      return null;
    }

    const sessions = readdirSync(sessionsPath);
    for (const sessionId of sessions.reverse()) {
      const meta = this.getSession(sessionId);
      if (meta && meta.userId === userId && meta.chatId === chatId && meta.mode !== "idle") {
        return meta;
      }
    }
    return null;
  }

  getOrCreateSession(userId: string, chatId: string): SessionMeta {
    const existing = this.findActiveSession(userId, chatId);
    if (existing) {
      return existing;
    }
    return this.createSession(userId, chatId);
  }

  saveMeta(meta: SessionMeta): void {
    const metaPath = this.getMetaPath(meta.id);
    meta.updatedAt = new Date().toISOString();
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  updateSessionMode(sessionId: string, mode: SessionMeta["mode"]): SessionMeta | null {
    const meta = this.getSession(sessionId);
    if (!meta) return null;
    meta.mode = mode;
    this.saveMeta(meta);
    return meta;
  }

  setSessionRepo(sessionId: string, repo: SessionMeta["repo"]): SessionMeta | null {
    const meta = this.getSession(sessionId);
    if (!meta) return null;
    meta.repo = repo;
    this.saveMeta(meta);
    return meta;
  }

  appendNote(sessionId: string, text: string, kind: NoteKind = "text"): void {
    const meta = this.getSession(sessionId);
    if (!meta) return;

    const notesPath = this.getNotesPath(sessionId);
    const timestamp = new Date().toISOString();
    const entry = `\n## [${kind.toUpperCase()}] ${timestamp}\n\n${text}\n`;

    const existing = existsSync(notesPath) ? readFileSync(notesPath, "utf-8") : "";
    writeFileSync(notesPath, existing + entry);

    meta.noteCount = (meta.noteCount || 0) + 1;
    meta.lastActivityAt = timestamp;
    this.saveMeta(meta);
  }

  saveAttachment(
    sessionId: string,
    filename: string,
    data: Buffer,
    kind: NoteKind,
    telegramFileId?: string,
    mimeType?: string
  ): Attachment {
    const attachmentsPath = this.getAttachmentsPath(sessionId);
    const attachmentId = `A-${randomUUID()}`;
    const ext = filename.split(".").pop() || "";
    const savedFilename = `${attachmentId}.${ext}`;
    const localPath = join(attachmentsPath, savedFilename);

    writeFileSync(localPath, data);

    const attachment: Attachment = {
      id: attachmentId,
      kind,
      filename,
      mimeType,
      localPath,
      telegramFileId,
      capturedAt: new Date().toISOString(),
    };

    const manifest = this.getAttachmentManifest(sessionId);
    manifest.push(attachment);
    this.saveAttachmentManifest(sessionId, manifest);

    this.appendNote(sessionId, `[Attachment: ${filename}](${localPath})`, kind);

    return attachment;
  }

  private getAttachmentManifestPath(sessionId: string): string {
    return join(this.getSessionPath(sessionId), "attachments.json");
  }

  private getAttachmentManifest(sessionId: string): Attachment[] {
    const path = this.getAttachmentManifestPath(sessionId);
    if (!existsSync(path)) {
      return [];
    }
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return data.map((a: unknown) => AttachmentSchema.parse(a));
    } catch {
      return [];
    }
  }

  private saveAttachmentManifest(sessionId: string, attachments: Attachment[]): void {
    const path = this.getAttachmentManifestPath(sessionId);
    writeFileSync(path, JSON.stringify(attachments, null, 2));
  }

  appendEvent(sessionId: string, event: ChatEvent): void {
    const eventsPath = this.getEventsPath(sessionId);
    let events: ChatEvent[] = [];
    if (existsSync(eventsPath)) {
      try {
        events = JSON.parse(readFileSync(eventsPath, "utf-8"));
      } catch {
        events = [];
      }
    }
    events.push(event);
    writeFileSync(eventsPath, JSON.stringify(events, null, 2));
  }

  getEvents(sessionId: string): ChatEvent[] {
    const eventsPath = this.getEventsPath(sessionId);
    if (!existsSync(eventsPath)) {
      return [];
    }
    try {
      return JSON.parse(readFileSync(eventsPath, "utf-8"));
    } catch {
      return [];
    }
  }

  getNotes(sessionId: string): string {
    const notesPath = this.getNotesPath(sessionId);
    if (!existsSync(notesPath)) {
      return "";
    }
    return readFileSync(notesPath, "utf-8");
  }

  listSessions(userId?: string): SessionMeta[] {
    const sessionsPath = this.getSessionsPath();
    if (!existsSync(sessionsPath)) {
      return [];
    }

    const sessions: SessionMeta[] = [];
    for (const sessionId of readdirSync(sessionsPath)) {
      const meta = this.getSession(sessionId);
      if (meta && (!userId || meta.userId === userId)) {
        sessions.push(meta);
      }
    }
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
