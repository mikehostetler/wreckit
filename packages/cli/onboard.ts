import { Command } from "commander";
import * as prompts from "@clack/prompts";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { MobileConfig } from "../shared/contracts.js";
import { createLogger } from "../../src/logging.js";

const log = createLogger({ verbose: true });

const CONFIG_DIR = join(process.env.HOME || "~", ".wreckit");
const CONFIG_PATH = join(CONFIG_DIR, "mobile-config.json");
const LICENSE_PATH = join(CONFIG_DIR, "license.json");

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Set up Wreckit Mobile configuration")
    .option("--force", "Overwrite existing configuration")
    .action(async (options) => {
      prompts.intro("🚀 Wreckit Mobile Setup");

      if (existsSync(CONFIG_PATH) && !options.force) {
        const overwrite = await prompts.confirm({
          message: "Configuration already exists. Overwrite?",
        });
        if (!overwrite || prompts.isCancel(overwrite)) {
          prompts.outro("Setup cancelled.");
          return;
        }
      }

      const telegramToken = await prompts.text({
        message: "Telegram Bot Token:",
        placeholder: "From @BotFather",
        validate: (value) => {
          if (!value || value.length < 10) return "Invalid token";
        },
      });
      if (prompts.isCancel(telegramToken)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const telegramUserIds = await prompts.text({
        message: "Allowed Telegram User IDs (comma-separated):",
        placeholder: "123456789,987654321",
        validate: (value) => {
          if (!value) return "At least one user ID required";
          const ids = value.split(",").map((id) => parseInt(id.trim(), 10));
          if (ids.some(isNaN)) return "Invalid user ID format";
        },
      });
      if (prompts.isCancel(telegramUserIds)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const githubToken = await prompts.text({
        message: "GitHub Token:",
        placeholder: "ghp_...",
        validate: (value) => {
          if (!value || value.length < 10) return "Invalid token";
        },
      });
      if (prompts.isCancel(githubToken)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const zaiApiKey = await prompts.text({
        message: "Z.AI API Key (primary LLM):",
        placeholder: "Your z.ai API key",
      });
      if (prompts.isCancel(zaiApiKey)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const repoInput = await prompts.text({
        message: "Repository to manage (owner/name):",
        placeholder: "myorg/myrepo",
        validate: (value) => {
          if (!value || !value.includes("/")) return "Format: owner/name";
        },
      });
      if (prompts.isCancel(repoInput)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const repoLocalPath = await prompts.text({
        message: "Local path to repository:",
        placeholder: "/Users/you/projects/myrepo",
        validate: (value) => {
          if (!value) return "Path required";
          if (!existsSync(value)) return "Path does not exist";
        },
      });
      if (prompts.isCancel(repoLocalPath)) {
        prompts.outro("Setup cancelled.");
        return;
      }

      const [owner, name] = (repoInput as string).split("/");
      const userIds = (telegramUserIds as string)
        .split(",")
        .map((id) => parseInt(id.trim(), 10));

      const config: MobileConfig = {
        telegram: {
          botToken: telegramToken as string,
          allowedUserIds: userIds,
        },
        github: {
          token: githubToken as string,
        },
        llm: {
          zai: {
            apiKey: zaiApiKey as string,
            baseUrl: "https://api.z.ai/api/paas/v4/chat/completions",
            model: "glm-4.7",
          },
          roles: {
            synthesizer: "zai",
            implementer: "zai",
            reviewer: "zai",
          },
        },
        repos: [
          {
            owner,
            name,
            localPath: repoLocalPath as string,
            defaultBranch: "main",
          },
        ],
      };

      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
      }

      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      log.info(`Configuration saved to ${CONFIG_PATH}`);

      if (!existsSync(LICENSE_PATH)) {
        const license = {
          licenseKey: "trial",
          issuedAt: new Date().toISOString(),
        };
        writeFileSync(LICENSE_PATH, JSON.stringify(license, null, 2));
        log.info(`Trial license created at ${LICENSE_PATH}`);
      }

      prompts.outro(`✅ Configuration saved to ${CONFIG_PATH}

Next steps:
1. Run: wreckit gateway start
2. Message your bot on Telegram
3. Start capturing notes!`);
    });
}
