import type { ComputeBackend } from "./ComputeBackend";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import { LocalBackend } from "./LocalBackend";
import { SpritesBackend } from "./sprites";

export interface ResolveBackendOptions {
  root: string;
  config: ConfigResolved;
  logger: Logger;
  repoSlug: string;
}

export async function resolveBackend(
  options: ResolveBackendOptions
): Promise<ComputeBackend> {
  const { root, config, logger, repoSlug } = options;

  if (process.env.WRECKIT_EXEC_CONTEXT === "sprite") {
    logger.debug("Running inside sprite, forcing local backend");
    return new LocalBackend(root, config, logger);
  }

  const backend = config.compute.backend;

  switch (backend) {
    case "local":
      return new LocalBackend(root, config, logger);

    case "sprites": {
      const spritesConfig = config.compute.sprites;
      if (!spritesConfig?.enabled) {
        logger.warn(
          "Sprites backend requested but not enabled, falling back to local"
        );
        return new LocalBackend(root, config, logger);
      }

      return SpritesBackend.create(
        root,
        spritesConfig,
        config.limits,
        logger,
        repoSlug
      );
    }

    default: {
      const exhaustiveCheck: never = backend;
      throw new Error(`Unknown compute backend: ${exhaustiveCheck}`);
    }
  }
}
