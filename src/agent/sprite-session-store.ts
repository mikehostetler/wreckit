import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import { findRepoRoot, getSessionsDir, getSessionPath } from "../fs/paths";
import type { SpriteAgentConfig } from "../schemas";
import { safeWriteJson } from "../fs/atomic";

/**
 * Session state for Sprite agent execution
 */
export interface SpriteSession {
  sessionId: string;
  vmName: string;
  itemId?: string;
  startTime: string; // ISO timestamp
  config: SpriteAgentConfig;
  state: "running" | "paused" | "completed" | "failed";
  checkpoint?: {
    iteration: number;
    progressLog: string;
    timestamp: string; // ISO timestamp
  };
  endTime?: string; // ISO timestamp
  error?: string;
}

/**
 * Store for managing Sprite session persistence
 */
export class SpriteSessionStore {
  private readonly root: string;
  private readonly logger: Logger;

  constructor(cwd: string, logger: Logger) {
    this.root = findRepoRoot(cwd);
    this.logger = logger;
  }

  /**
   * Ensure sessions directory exists
   */
  private async ensureSessionsDir(): Promise<void> {
    const sessionsDir = getSessionsDir(this.root);
    await fs.mkdir(sessionsDir, { recursive: true });
  }

  /**
   * Save a session to disk
   */
  async save(session: SpriteSession): Promise<void> {
    await this.ensureSessionsDir();
    const sessionPath = getSessionPath(this.root, session.sessionId);
    await safeWriteJson(sessionPath, session);
    this.logger.debug(`Saved session: ${session.sessionId}`);
  }

  /**
   * Load a session from disk
   */
  async load(sessionId: string): Promise<SpriteSession | null> {
    const sessionPath = getSessionPath(this.root, sessionId);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(content) as SpriteSession;
      this.logger.debug(`Loaded session: ${sessionId}`);
      return session;
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        this.logger.debug(`Session not found: ${sessionId}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * List all sessions, optionally filtered
   */
  async list(filter?: {
    state?: SpriteSession["state"];
    itemId?: string;
  }): Promise<SpriteSession[]> {
    await this.ensureSessionsDir();
    const sessionsDir = getSessionsDir(this.root);

    try {
      const entries = await fs.readdir(sessionsDir);
      const sessions: SpriteSession[] = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const sessionId = entry.replace(".json", "");
        const sessionPath = getSessionPath(this.root, sessionId);
        try {
          const content = await fs.readFile(sessionPath, "utf-8");
          const session = JSON.parse(content) as SpriteSession;

          // Apply filters
          if (filter?.state && session.state !== filter.state) continue;
          if (filter?.itemId && session.itemId !== filter.itemId) continue;

          sessions.push(session);
        } catch (err) {
          this.logger.warn(`Failed to read session ${entry}: ${err}`);
        }
      }

      // Sort by start time (newest first)
      sessions.sort((a, b) =>
        b.startTime.localeCompare(a.startTime)
      );

      return sessions;
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Delete a session from disk
   */
  async delete(sessionId: string): Promise<void> {
    const sessionPath = getSessionPath(this.root, sessionId);
    try {
      await fs.unlink(sessionPath);
      this.logger.debug(`Deleted session: ${sessionId}`);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        this.logger.debug(`Session not found for deletion: ${sessionId}`);
        return;
      }
      throw err;
    }
  }

  /**
   * Update session state
   */
  async updateState(
    sessionId: string,
    state: SpriteSession["state"],
    updates?: Partial<Omit<SpriteSession, "sessionId" | "vmName" | "startTime" | "config">>
  ): Promise<void> {
    const session = await this.load(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.state = state;
    if (updates) {
      Object.assign(session, updates);
    }

    await this.save(session);
  }

  /**
   * Generate a unique session ID
   */
  static generateSessionId(): string {
    return `sprite-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
