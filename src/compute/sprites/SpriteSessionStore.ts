import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { safeWriteJson } from "../../fs/atomic";

const SpriteSessionSchema = z.object({
  spriteId: z.string(),
  repoSlug: z.string(),
  itemId: z.string(),
  createdAt: z.string(),
  lastAccessedAt: z.string(),
  status: z.enum(["active", "paused", "completed", "failed"]),
});

export type SpriteSession = z.infer<typeof SpriteSessionSchema>;

export class SpriteSessionStore {
  private sessionsDir: string;

  constructor(root: string) {
    this.sessionsDir = path.join(root, ".wreckit", "sessions");
  }

  static getSessionKey(repoSlug: string, itemId: string): string {
    const encodedSlug = encodeURIComponent(repoSlug);
    return `${encodedSlug}__${itemId}`;
  }

  private getSessionPath(repoSlug: string, itemId: string): string {
    const key = SpriteSessionStore.getSessionKey(repoSlug, itemId);
    return path.join(this.sessionsDir, `${key}.json`);
  }

  async get(repoSlug: string, itemId: string): Promise<SpriteSession | null> {
    const sessionPath = this.getSessionPath(repoSlug, itemId);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      const data = JSON.parse(content);
      const parsed = SpriteSessionSchema.safeParse(data);
      if (parsed.success) {
        return parsed.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  async save(session: SpriteSession): Promise<void> {
    const sessionPath = this.getSessionPath(session.repoSlug, session.itemId);
    await safeWriteJson(sessionPath, session);
  }

  async delete(repoSlug: string, itemId: string): Promise<void> {
    const sessionPath = this.getSessionPath(repoSlug, itemId);
    try {
      await fs.unlink(sessionPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async list(): Promise<SpriteSession[]> {
    const sessions: SpriteSession[] = [];
    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          const filePath = path.join(this.sessionsDir, entry.name);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const data = JSON.parse(content);
            const parsed = SpriteSessionSchema.safeParse(data);
            if (parsed.success) {
              sessions.push(parsed.data);
            }
          } catch {
            // Skip corrupted files
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return sessions;
  }

  async touch(repoSlug: string, itemId: string): Promise<void> {
    const session = await this.get(repoSlug, itemId);
    if (session) {
      session.lastAccessedAt = new Date().toISOString();
      await this.save(session);
    }
  }
}
