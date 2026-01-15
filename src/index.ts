#!/usr/bin/env bun

import * as path from "node:path";
import { Command } from "commander";
import { initLogger, logger } from "./logging";
import { toExitCode } from "./errors";
import { executeCommand, setupInterruptHandler } from "./cli-utils";
import { ideasCommand } from "./commands/ideas";
import { statusCommand } from "./commands/status";
import { listCommand } from "./commands/list";
import { showCommand } from "./commands/show";
import { runPhaseCommand } from "./commands/phase";
import { runCommand } from "./commands/run";
import { orchestrateAll, orchestrateNext } from "./commands/orchestrator";
import { doctorCommand } from "./commands/doctor";
import { initCommand } from "./commands/init";
import { runOnboardingIfNeeded } from "./onboarding";
import { resolveId } from "./domain/resolveId";
import { findRepoRoot, resolveCwd } from "./fs/paths";

export const program = new Command();

program
  .name("wreckit")
  .description(
    "A CLI tool for turning ideas into automated PRs through an autonomous agent loop"
  )
  .version("0.0.1")
  .option("--verbose", "Enable verbose output")
  .option("--quiet", "Suppress non-essential output")
  .option("--debug", "Output structured JSON logs (ndjson format)")
  .option("--no-tui", "Disable terminal UI")
  .option("--tui-debug", "Enable TUI debug mode (logs render frames)")
  .option("--dry-run", "Show what would be done without making changes")
  .option(
    "--mock-agent",
    "Simulate agent responses without calling the real agent"
  )
  .option("--cwd <path>", "Override the working directory");

program.action(async () => {
  const opts = program.opts();
  await executeCommand(
    async () => {
      const onboarding = await runOnboardingIfNeeded(logger, {
        noTui: opts.noTui,
        cwd: resolveCwd(opts.cwd),
      });
      if (!onboarding.proceed) {
        if (onboarding.reason === "noninteractive") {
          process.exit(1);
        }
        return;
      }

      const result = await orchestrateAll(
        {
          force: false,
          dryRun: opts.dryRun,
          noTui: opts.noTui,
          tuiDebug: opts.tuiDebug,
          cwd: resolveCwd(opts.cwd),
          mockAgent: opts.mockAgent,
        },
        logger
      );

      if (result.completed.length > 0) {
        logger.info(`Completed ${result.completed.length} items`);
      }
      if (result.failed.length > 0) {
        logger.warn(`Failed ${result.failed.length} items`);
        result.failed.forEach((id) => logger.warn(`  - ${id}`));
      }
      if (result.remaining.length > 0) {
        logger.info(`Remaining: ${result.remaining.length} items`);
      }

      if (result.failed.length > 0) {
        process.exit(1);
      }
    },
    logger,
    {
      verbose: opts.verbose,
      quiet: opts.quiet,
      dryRun: opts.dryRun,
      noTui: opts.noTui,
      tuiDebug: opts.tuiDebug,
    }
  );
});

program
   .command("ideas")
   .description("Ingest ideas from stdin or file")
   .option("-f, --file <path>", "Read ideas from file instead of stdin")
   .action(async (options, cmd) => {
     const globalOpts = cmd.optsWithGlobals();
     await executeCommand(
       async () => {
         await ideasCommand(
           {
             file: options.file,
             dryRun: globalOpts.dryRun,
             cwd: resolveCwd(globalOpts.cwd),
           },
           logger
         );
       },
       logger,
       {
         verbose: globalOpts.verbose,
         quiet: globalOpts.quiet,
         dryRun: globalOpts.dryRun,
         cwd: resolveCwd(globalOpts.cwd),
       }
     );
   });

program
   .command("idea")
   .description("Add a new idea (interactive or from stdin)")
   .option("-f, --file <path>", "Read idea from file instead of interactive prompt")
   .action(async (options, cmd) => {
     const globalOpts = cmd.optsWithGlobals();
     await executeCommand(
       async () => {
         await ideasCommand(
           {
             file: options.file,
             interactive: true,
             dryRun: globalOpts.dryRun,
             cwd: resolveCwd(globalOpts.cwd),
           },
           logger
         );
       },
       logger,
       {
         verbose: globalOpts.verbose,
         quiet: globalOpts.quiet,
         dryRun: globalOpts.dryRun,
         cwd: resolveCwd(globalOpts.cwd),
       }
     );
   });

program
  .command("status")
  .description("List all items with state")
  .option("--json", "Output as JSON")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await statusCommand(
          { json: options.json, cwd: resolveCwd(globalOpts.cwd) },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("list")
  .description("List items with optional filtering")
  .option("--json", "Output as JSON")
  .option("--state <state>", "Filter by state (raw, researched, planned, implementing, in_pr, done)")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await listCommand(
          {
            json: options.json,
            state: options.state,
            cwd: resolveCwd(globalOpts.cwd),
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("show <id>")
  .description("Show item details")
  .option("--json", "Output as JSON")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await showCommand(
          resolvedId,
          { json: options.json, cwd },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("research <id>")
  .description("Run research phase: raw → researched")
  .option("--force", "Regenerate artifacts even if they exist")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runPhaseCommand(
          "research",
          resolvedId,
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("plan <id>")
  .description("Run plan phase: researched → planned")
  .option("--force", "Regenerate artifacts even if they exist")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runPhaseCommand(
          "plan",
          resolvedId,
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("implement <id>")
  .description("Run implement phase: planned → implementing")
  .option("--force", "Re-run even if in progress")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runPhaseCommand(
          "implement",
          resolvedId,
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("pr <id>")
  .description("Create/update PR: implementing → in_pr")
  .option("--force", "Force PR update")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runPhaseCommand(
          "pr",
          resolvedId,
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("complete <id>")
  .description("Mark as complete: in_pr → done")
  .action(async (id, _options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runPhaseCommand(
          "complete",
          resolvedId,
          { dryRun: globalOpts.dryRun, cwd },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("run <id>")
  .description("Run single item through all phases until done")
  .option("--force", "Regenerate artifacts even if they exist")
  .action(async (id, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const cwd = resolveCwd(globalOpts.cwd);
        const root = findRepoRoot(cwd);
        const resolvedId = await resolveId(root, id);
        await runCommand(
          resolvedId,
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("next")
  .description("Run next incomplete item")
  .action(async (_options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        const onboarding = await runOnboardingIfNeeded(logger, {
          noTui: globalOpts.noTui,
          cwd: resolveCwd(globalOpts.cwd),
        });
        if (!onboarding.proceed) {
          if (onboarding.reason === "noninteractive") {
            process.exit(1);
          }
          return;
        }

        const result = await orchestrateNext(
          {
            dryRun: globalOpts.dryRun,
            noTui: globalOpts.noTui,
            tuiDebug: globalOpts.tuiDebug,
            cwd: resolveCwd(globalOpts.cwd),
            mockAgent: globalOpts.mockAgent,
          },
          logger
        );

        if (result.itemId === null) {
          logger.info("All items complete");
        } else if (result.success) {
          logger.info(`Completed: ${result.itemId}`);
        } else {
          logger.error(`Failed: ${result.itemId}`);
          process.exit(1);
        }
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        noTui: globalOpts.noTui,
        tuiDebug: globalOpts.tuiDebug,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("doctor")
  .description("Validate all items and optionally fix issues")
  .option("--fix", "Auto-fix recoverable issues")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await doctorCommand(
          { fix: options.fix, cwd: resolveCwd(globalOpts.cwd) },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

program
  .command("init")
  .description("Initialize .wreckit/ in the current repository")
  .option("--force", "Overwrite existing .wreckit/")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await initCommand(
          { force: options.force, cwd: resolveCwd(globalOpts.cwd) },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });

async function main(): Promise<void> {
  setupInterruptHandler(logger);

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    initLogger({
      verbose: opts.verbose,
      quiet: opts.quiet,
      debug: opts.debug,
    });
  });

  try {
    await program.parseAsync();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(toExitCode(error));
  }
}

if (import.meta.main) {
  main();
}
