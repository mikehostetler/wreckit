import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../logging";
import { buildSdkEnv } from "../agent/env.js";

// Use console.log directly for this diagnostic tool (logger defaults to silent)
const log = console.log;

export async function sdkInfoCommand(
  _options: Record<string, unknown>,
  logger: Logger
): Promise<void> {
  const cwd = process.cwd();
  log("Fetching SDK configuration info...\n");

  // Build the resolved environment (same as what the SDK runner uses)
  const sdkEnv = await buildSdkEnv({ cwd, logger });

  // Log resolved environment variables (without exposing secrets)
  log("Resolved Environment (merged from all sources):");
  log(`  ANTHROPIC_BASE_URL: ${sdkEnv.ANTHROPIC_BASE_URL ?? "(not set)"}`);
  log(`  ANTHROPIC_AUTH_TOKEN: ${sdkEnv.ANTHROPIC_AUTH_TOKEN ? "(set)" : "(not set)"}`);
  log(`  ANTHROPIC_API_KEY: ${sdkEnv.ANTHROPIC_API_KEY === "" ? "(blanked)" : sdkEnv.ANTHROPIC_API_KEY ? "(set)" : "(not set)"}`);
  log(`  ANTHROPIC_MODEL: ${sdkEnv.ANTHROPIC_MODEL ?? "(not set)"}`);
  log(`  ANTHROPIC_DEFAULT_SONNET_MODEL: ${sdkEnv.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "(not set)"}`);
  log(`  ANTHROPIC_DEFAULT_HAIKU_MODEL: ${sdkEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "(not set)"}`);
  log(`  ANTHROPIC_DEFAULT_OPUS_MODEL: ${sdkEnv.ANTHROPIC_DEFAULT_OPUS_MODEL ?? "(not set)"}`);
  log("");
  log("Sources checked (highest to lowest precedence):");
  log("  1. .wreckit/config.local.json agent.env");
  log("  2. .wreckit/config.json agent.env");
  log("  3. process.env (shell)");
  log("  4. ~/.claude/settings.json env");
  log("");

  // Create a minimal query to get account info
  try {
    log("Querying SDK for account info...");
    
    const queryInstance = query({
      prompt: "Return immediately with no action needed.",
      options: {
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 1,
        env: sdkEnv,
      },
    });

    // Get account info from the query instance
    const accountInfo = await queryInstance.accountInfo();
    
    log("\nAccount Info from SDK:");
    log(`  email: ${accountInfo.email ?? "(not available)"}`);
    log(`  organization: ${accountInfo.organization ?? "(not available)"}`);
    log(`  subscriptionType: ${accountInfo.subscriptionType ?? "(not available)"}`);
    log(`  tokenSource: ${accountInfo.tokenSource ?? "(not available)"}`);
    log(`  apiKeySource: ${accountInfo.apiKeySource ?? "(not available)"}`);

    // Get supported models
    const models = await queryInstance.supportedModels();
    log("\nSupported Models:");
    for (const model of models.slice(0, 5)) {
      const modelInfo = model as { displayName?: string; name?: string };
      log(`  - ${modelInfo.displayName ?? modelInfo.name ?? JSON.stringify(model)}`);
    }
    if (models.length > 5) {
      log(`  ... and ${models.length - 5} more`);
    }

    // Abort the query since we just wanted the info
    queryInstance.return();

  } catch (error) {
    console.error(`Failed to query SDK: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}
