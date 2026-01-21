import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SpritesClient, Sprite } from "@fly/sprites";
import type {
  ComputeBackend,
  LogEvent,
  IterationOptions,
  IterationState,
} from "../ComputeBackend";
import { IterationStateSchema } from "../ComputeBackend";
import type { SpritesConfigResolved, LimitsConfigResolved } from "../../config";
import type { Logger } from "../../logging";
import {
  SpriteSessionStore,
  type SpriteSession,
} from "./SpriteSessionStore";
import { loadSpriteEnv, validateSpriteEnv } from "./SpriteEnv";

export interface SpritesEnv {
  SPRITE_TOKEN: string;
  GITHUB_TOKEN: string;
}

export interface SpritesBackendDeps {
  client: SpritesClient;
}

export class SpritesBackend implements ComputeBackend {
  readonly name = "sprites";

  private client: SpritesClient;
  private sessionStore: SpriteSessionStore;
  private activeSprite: Sprite | null = null;
  private currentItemId: string | null = null;
  private succeeded = false;

  constructor(
    private root: string,
    private config: SpritesConfigResolved,
    private limits: LimitsConfigResolved,
    private logger: Logger,
    private env: SpritesEnv,
    private repoSlug: string,
    deps?: SpritesBackendDeps
  ) {
    this.client =
      deps?.client ?? new SpritesClient(env.SPRITE_TOKEN);
    this.sessionStore = new SpriteSessionStore(root);
  }

  static async create(
    root: string,
    config: SpritesConfigResolved,
    limits: LimitsConfigResolved,
    logger: Logger,
    repoSlug: string
  ): Promise<SpritesBackend> {
    const env = await loadSpriteEnv(root);
    const validation = validateSpriteEnv(env);

    if (!validation.valid) {
      throw new Error(
        `Missing required sprite tokens: ${validation.missing.join(", ")}`
      );
    }

    return new SpritesBackend(
      root,
      config,
      limits,
      logger,
      { SPRITE_TOKEN: env.SPRITE_TOKEN, GITHUB_TOKEN: env.GITHUB_TOKEN },
      repoSlug
    );
  }

  private sanitizeItemId(itemId: string): string {
    return itemId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  }

  private getSpriteName(itemId: string): string {
    const sanitized = this.sanitizeItemId(itemId);
    return `${this.config.name_prefix}-${sanitized}`;
  }

  private async ensureSprite(itemId: string): Promise<Sprite> {
    if (this.activeSprite && this.currentItemId === itemId) {
      return this.activeSprite;
    }

    const existingSession = await this.sessionStore.get(this.repoSlug, itemId);

    if (existingSession && this.config.resume) {
      try {
        const sprite = await this.client.getSprite(existingSession.spriteId);
        this.activeSprite = sprite;
        this.currentItemId = itemId;
        await this.sessionStore.touch(this.repoSlug, itemId);
        this.logger.debug(`Reusing existing sprite: ${existingSession.spriteId}`);
        return sprite;
      } catch {
        this.logger.debug(
          `Sprite ${existingSession.spriteId} no longer exists, creating new one`
        );
        await this.sessionStore.delete(this.repoSlug, itemId);
      }
    }

    const spriteName = this.getSpriteName(itemId);
    this.logger.info(`Creating sprite: ${spriteName}`);

    const sprite = await this.client.createSprite(spriteName);

    const session: SpriteSession = {
      spriteId: spriteName,
      repoSlug: this.repoSlug,
      itemId,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      status: "active",
    };
    await this.sessionStore.save(session);

    await this.setupSprite(sprite, itemId);

    this.activeSprite = sprite;
    this.currentItemId = itemId;
    return sprite;
  }

  private async setupSprite(sprite: Sprite, itemId: string): Promise<void> {
    const workdir = this.config.workdir;

    this.logger.debug("Setting up sprite environment...");

    await sprite.exec(`mkdir -p ${workdir}/session ${workdir}/templates ${workdir}/repos`);

    const cloneUrl = this.buildCloneUrl();
    const repoName = this.repoSlug.split("/").pop() || "repo";
    const repoPath = `${workdir}/repos/${repoName}`;

    this.logger.debug(`Cloning repository to ${repoPath}`);
    await sprite.exec(`git clone ${cloneUrl} ${repoPath}`);

    await sprite.exec("git config user.name " + JSON.stringify(this.config.github.git_user_name), {
      cwd: repoPath,
    });
    await sprite.exec("git config user.email " + JSON.stringify(this.config.github.git_user_email), {
      cwd: repoPath,
    });

    this.logger.debug("Installing dependencies...");
    try {
      await sprite.exec("bun install", { cwd: repoPath });
    } catch {
      try {
        await sprite.exec("npm install", { cwd: repoPath });
      } catch {
        this.logger.debug("No package manager install needed or failed");
      }
    }

    for (const uploadPath of this.config.sync.upload_paths) {
      await this.syncSinglePath(sprite, "upload", uploadPath, repoPath);
    }
  }

  private buildCloneUrl(): string {
    if (this.config.github.use_token_for_clone) {
      return `https://x-access-token:${this.env.GITHUB_TOKEN}@github.com/${this.repoSlug}.git`;
    }
    return `https://github.com/${this.repoSlug}.git`;
  }

  private async syncSinglePath(
    sprite: Sprite,
    direction: "upload" | "download",
    relativePath: string,
    remoteRepoPath: string
  ): Promise<void> {
    const localPath = path.join(this.root, relativePath);
    const remotePath = `${remoteRepoPath}/${relativePath}`;

    if (direction === "upload") {
      try {
        const stat = await fs.stat(localPath);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(localPath, { recursive: true });
          for (const entry of entries) {
            const entryPath = path.join(localPath, entry.toString());
            const entryStat = await fs.stat(entryPath);
            if (entryStat.isFile()) {
              const content = await fs.readFile(entryPath);
              const remoteEntryPath = `${remotePath}/${entry}`;
              await sprite.exec(`mkdir -p $(dirname ${JSON.stringify(remoteEntryPath)})`);
              const base64Content = content.toString("base64");
              await sprite.exec(
                `echo ${JSON.stringify(base64Content)} | base64 -d > ${JSON.stringify(remoteEntryPath)}`
              );
            }
          }
        } else {
          const content = await fs.readFile(localPath);
          await sprite.exec(`mkdir -p $(dirname ${JSON.stringify(remotePath)})`);
          const base64Content = content.toString("base64");
          await sprite.exec(
            `echo ${JSON.stringify(base64Content)} | base64 -d > ${JSON.stringify(remotePath)}`
          );
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    } else {
      try {
        const { stdout } = await sprite.exec(`cat ${JSON.stringify(remotePath)} | base64`);
        const content = Buffer.from(stdout.toString().trim(), "base64");
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, content);
      } catch {
        this.logger.debug(`File not found on sprite: ${remotePath}`);
      }
    }
  }

  async *runIteration(
    itemId: string,
    options: IterationOptions
  ): AsyncIterable<LogEvent> {
    const sprite = await this.ensureSprite(itemId);
    const repoName = this.repoSlug.split("/").pop() || "repo";
    const repoPath = `${this.config.workdir}/repos/${repoName}`;

    const agentCommand = this.buildAgentCommand(options.prompt);

    this.logger.debug(`Running agent command in sprite: ${agentCommand}`);

    const cmd = sprite.spawn("bash", ["-c", agentCommand], {
      cwd: repoPath,
      env: {
        GITHUB_TOKEN: this.env.GITHUB_TOKEN,
      },
    });

    const events: LogEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    const pushEvent = (event: LogEvent) => {
      events.push(event);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    cmd.stdout.on("data", (chunk: Buffer) => {
      pushEvent({
        type: "stdout",
        message: chunk.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    cmd.stderr.on("data", (chunk: Buffer) => {
      pushEvent({
        type: "stderr",
        message: chunk.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    cmd.on("error", (err: Error) => {
      pushEvent({
        type: "error",
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    });

    const timeoutMs = (options.timeoutSeconds ?? this.limits.max_duration_hours * 3600) * 1000;
    const timeoutId = setTimeout(() => {
      cmd.kill();
      pushEvent({
        type: "error",
        message: `Agent timed out after ${timeoutMs / 1000} seconds`,
        timestamp: new Date().toISOString(),
      });
    }, timeoutMs);

    cmd.on("exit", (code: number) => {
      clearTimeout(timeoutId);
      if (code === 0) {
        this.succeeded = true;
      }
      done = true;
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    while (!done || events.length > 0) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }
  }

  private buildAgentCommand(prompt: string): string {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    return `claude -p '${escapedPrompt}' --dangerously-skip-permissions`;
  }

  async sync(direction: "upload" | "download", paths: string[]): Promise<void> {
    if (!this.activeSprite || !this.currentItemId) {
      throw new Error("No active sprite for sync");
    }

    const repoName = this.repoSlug.split("/").pop() || "repo";
    const repoPath = `${this.config.workdir}/repos/${repoName}`;

    for (const p of paths) {
      await this.syncSinglePath(this.activeSprite, direction, p, repoPath);
    }
  }

  async readState(itemId: string): Promise<IterationState> {
    if (!this.activeSprite) {
      return { status: "CONTINUE" };
    }

    const repoName = this.repoSlug.split("/").pop() || "repo";
    const statePath = `${this.config.workdir}/repos/${repoName}/.wreckit/items/${itemId}/state.json`;

    try {
      const { stdout } = await this.activeSprite.exec(`cat ${JSON.stringify(statePath)}`);
      const data = JSON.parse(stdout.toString());
      const result = IterationStateSchema.safeParse(data);
      if (result.success) {
        return result.data;
      }
      this.logger.warn(`Invalid state.json for ${itemId}: ${result.error.message}`);
      return { status: "CONTINUE" };
    } catch {
      return { status: "CONTINUE" };
    }
  }

  async writeResponse(itemId: string, response: string): Promise<void> {
    if (!this.activeSprite) {
      throw new Error("No active sprite for writeResponse");
    }

    const repoName = this.repoSlug.split("/").pop() || "repo";
    const responsePath = `${this.config.workdir}/repos/${repoName}/.wreckit/items/${itemId}/response.json`;
    const responseData = JSON.stringify({
      response,
      timestamp: new Date().toISOString(),
    });
    const base64Content = Buffer.from(responseData).toString("base64");

    await this.activeSprite.exec(
      `mkdir -p $(dirname ${JSON.stringify(responsePath)}) && echo ${JSON.stringify(base64Content)} | base64 -d > ${JSON.stringify(responsePath)}`
    );
  }

  async cleanup(): Promise<void> {
    if (this.activeSprite && this.currentItemId) {
      const session = await this.sessionStore.get(this.repoSlug, this.currentItemId);

      if (this.config.auto_delete && this.succeeded) {
        this.logger.info(`Deleting sprite: ${this.activeSprite.name}`);
        try {
          await this.activeSprite.delete();
        } catch (err) {
          this.logger.warn(`Failed to delete sprite: ${(err as Error).message}`);
        }
        await this.sessionStore.delete(this.repoSlug, this.currentItemId);
      } else if (session) {
        session.status = this.succeeded ? "completed" : "failed";
        session.lastAccessedAt = new Date().toISOString();
        await this.sessionStore.save(session);
      }
    }

    this.activeSprite = null;
    this.currentItemId = null;
    this.succeeded = false;
  }
}
