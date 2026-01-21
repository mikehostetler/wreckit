import { Command } from "commander";
import type { Logger } from "../logging";
import { SpriteSessionStore, type SpriteSession } from "../compute/sprites";
import { findRepoRoot } from "../fs/paths";
import { loadConfig } from "../config";
import { SpritesClient } from "@fly/sprites";
import { loadSpriteEnv, validateSpriteEnv } from "../compute/sprites/SpriteEnv";

export interface SpriteCommandOptions {
  cwd: string;
}

export interface SpriteDestroyOptions extends SpriteCommandOptions {
  force?: boolean;
}

export async function spriteStatusCommand(
  options: SpriteCommandOptions,
  logger: Logger
): Promise<void> {
  const root = findRepoRoot(options.cwd);
  const store = new SpriteSessionStore(root);
  const sessions = await store.list();

  if (sessions.length === 0) {
    console.log("No active sprite sessions");
    return;
  }

  console.log("Active Sprite Sessions:");
  console.log("");
  console.log(
    "  Item ID              Sprite ID                Status      Last Accessed"
  );
  console.log(
    "  ────────────────────────────────────────────────────────────────────────"
  );
  for (const session of sessions) {
    console.log(
      `  ${session.itemId.padEnd(20)} ${session.spriteId.padEnd(24)} ${session.status.padEnd(11)} ${new Date(session.lastAccessedAt).toLocaleString()}`
    );
  }
}

export async function spriteResumeCommand(
  itemId: string,
  options: SpriteCommandOptions,
  logger: Logger
): Promise<void> {
  const root = findRepoRoot(options.cwd);
  const store = new SpriteSessionStore(root);

  const sessions = await store.list();
  const session = sessions.find((s) => s.itemId === itemId);

  if (!session) {
    throw new Error(`No sprite session found for item: ${itemId}`);
  }

  const env = await loadSpriteEnv(root);
  const validation = validateSpriteEnv(env);

  if (!validation.valid) {
    throw new Error(
      `Missing required sprite tokens: ${validation.missing.join(", ")}`
    );
  }

  const client = new SpritesClient(env.SPRITE_TOKEN);

  try {
    await client.getSprite(session.spriteId);
  } catch {
    throw new Error(
      `Sprite ${session.spriteId} no longer exists. Use 'wreckit sprite destroy ${itemId}' to clean up the session.`
    );
  }

  logger.info(`Resuming work on sprite for item: ${itemId}`);
  logger.info(`Run 'wreckit implement ${itemId}' to continue implementation`);
}

export async function spriteDestroyCommand(
  itemId: string,
  options: SpriteDestroyOptions,
  logger: Logger
): Promise<void> {
  const root = findRepoRoot(options.cwd);
  const store = new SpriteSessionStore(root);

  const sessions = await store.list();
  const session = sessions.find((s) => s.itemId === itemId);

  if (!session) {
    throw new Error(`No sprite session found for item: ${itemId}`);
  }

  if (session.status === "active" && !options.force) {
    throw new Error(
      `Session for ${itemId} is still active. Use --force to delete anyway.`
    );
  }

  const env = await loadSpriteEnv(root);
  const validation = validateSpriteEnv(env);

  if (validation.valid) {
    const client = new SpritesClient(env.SPRITE_TOKEN);
    try {
      const sprite = await client.getSprite(session.spriteId);
      await sprite.delete();
      logger.info(`Deleted sprite: ${session.spriteId}`);
    } catch {
      logger.warn(`Sprite ${session.spriteId} may already be deleted`);
    }
  } else {
    logger.warn("Cannot delete remote sprite: missing SPRITE_TOKEN");
  }

  await store.delete(session.repoSlug, session.itemId);
  logger.info(`Removed session for item: ${itemId}`);
}

export function createSpriteCommand(
  logger: Logger,
  resolveCwd: (cwd?: string) => string
): Command {
  const sprite = new Command("sprite").description("Manage Sprite cloud VMs");

  sprite
    .command("status")
    .description("Show active sprite sessions")
    .action(async (_options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await spriteStatusCommand({ cwd: resolveCwd(globalOpts.cwd) }, logger);
    });

  sprite
    .command("resume <itemId>")
    .description("Resume work on a paused sprite session")
    .action(async (itemId: string, _options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await spriteResumeCommand(itemId, { cwd: resolveCwd(globalOpts.cwd) }, logger);
    });

  sprite
    .command("destroy <itemId>")
    .description("Delete a sprite and its session")
    .option("--force", "Delete even if work is incomplete")
    .action(async (itemId: string, options: { force?: boolean }, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await spriteDestroyCommand(
        itemId,
        { force: options.force, cwd: resolveCwd(globalOpts.cwd) },
        logger
      );
    });

  return sprite;
}
