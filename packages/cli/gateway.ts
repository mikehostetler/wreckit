import { Command } from "commander";
import { Orchestrator } from "../gateway/orchestrator.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

export function registerGatewayCommand(program: Command): void {
  const gateway = program.command("gateway").description("Telegram gateway commands");

  gateway
    .command("start")
    .description("Start the Telegram gateway bot")
    .option("--config <path>", "Path to mobile-config.json")
    .option("--cwd <path>", "Working directory (where .wreckit/sessions will be stored)")
    .action(async (options) => {
      log.info("Starting Wreckit Gateway...");

      const orchestrator = new Orchestrator({
        configPath: options.config,
        repoPath: options.cwd || process.cwd(),
      });

      process.on("SIGINT", async () => {
        log.info("Received SIGINT, shutting down...");
        await orchestrator.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        log.info("Received SIGTERM, shutting down...");
        await orchestrator.stop();
        process.exit(0);
      });

      try {
        await orchestrator.start();
        log.info("Gateway is running. Press Ctrl+C to stop.");
      } catch (error) {
        log.error(`Failed to start gateway: ${error}`);
        process.exit(1);
      }
    });

  gateway
    .command("status")
    .description("Show gateway status and active sessions")
    .option("--cwd <path>", "Working directory")
    .action(async (options) => {
      const { SessionStore } = await import("../gateway/session-store.js");
      const store = new SessionStore(options.cwd || process.cwd());
      const sessions = store.listSessions();

      console.log("\n📊 Wreckit Gateway Status\n");
      console.log(`Total sessions: ${sessions.length}\n`);

      if (sessions.length === 0) {
        console.log("No sessions found. Start the gateway to begin capturing notes.");
        return;
      }

      console.log("Recent sessions:");
      for (const session of sessions.slice(0, 5)) {
        const repo = session.repo ? `${session.repo.owner}/${session.repo.name}` : "no repo";
        console.log(`  • ${session.id}`);
        console.log(`    Mode: ${session.mode} | Notes: ${session.noteCount} | Repo: ${repo}`);
        console.log(`    Created: ${session.createdAt}`);
        console.log();
      }
    });
}
