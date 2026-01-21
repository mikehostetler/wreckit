import { describe, it, expect, beforeEach, afterEach, vi, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalBackend } from "../../compute/LocalBackend";
import { SpritesBackend } from "../../compute/sprites";
import { resolveBackend } from "../../compute/resolveBackend";
import { DEFAULT_CONFIG, type ConfigResolved } from "../../config";
import type { Logger } from "../../logging";

function createTestLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createConfig(overrides: Partial<ConfigResolved> = {}): ConfigResolved {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    compute: {
      ...DEFAULT_CONFIG.compute,
      ...overrides.compute,
    },
    limits: {
      ...DEFAULT_CONFIG.limits,
      ...overrides.limits,
    },
  };
}

describe("resolveBackend", () => {
  let tempDir: string;
  let logger: Logger;
  const originalEnv = process.env.WRECKIT_EXEC_CONTEXT;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-resolve-backend-test-")
    );
    logger = createTestLogger();
    delete process.env.WRECKIT_EXEC_CONTEXT;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.WRECKIT_EXEC_CONTEXT = originalEnv;
    } else {
      delete process.env.WRECKIT_EXEC_CONTEXT;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("backend=local", () => {
    it("returns LocalBackend for backend=local", async () => {
      const config = createConfig({ compute: { backend: "local" } });

      const backend = await resolveBackend({
        root: tempDir,
        config,
        logger,
        repoSlug: "owner/repo",
      });

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(backend.name).toBe("local");
    });
  });

  describe("backend=sprites", () => {
    it("falls back to LocalBackend when sprites not enabled", async () => {
      const config = createConfig({
        compute: {
          backend: "sprites",
          sprites: {
            enabled: false,
            name_prefix: "wreckit",
            auto_delete: true,
            resume: true,
            workdir: "/var/local/wreckit",
            env_file: ".wreckit/.sprite.env",
            copy_claude_credentials: false,
            github: {
              use_token_for_clone: true,
              git_user_name: "wreckit",
              git_user_email: "wreckit@users.noreply.github.com",
            },
            sync: {
              upload_paths: [],
              download_paths: [],
            },
          },
        },
      });

      const backend = await resolveBackend({
        root: tempDir,
        config,
        logger,
        repoSlug: "owner/repo",
      });

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(logger.warn).toHaveBeenCalledWith(
        "Sprites backend requested but not enabled, falling back to local"
      );
    });

    it("falls back to LocalBackend when sprites config is undefined", async () => {
      const config = createConfig({
        compute: {
          backend: "sprites",
          sprites: undefined,
        },
      });

      const backend = await resolveBackend({
        root: tempDir,
        config,
        logger,
        repoSlug: "owner/repo",
      });

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("creates SpritesBackend when sprites enabled with valid config", async () => {
      const spritesCreateSpy = vi
        .spyOn(SpritesBackend, "create")
        .mockResolvedValue({
          name: "sprites",
        } as unknown as SpritesBackend);

      const config = createConfig({
        compute: {
          backend: "sprites",
          sprites: {
            enabled: true,
            name_prefix: "wreckit",
            auto_delete: true,
            resume: true,
            workdir: "/var/local/wreckit",
            env_file: ".wreckit/.sprite.env",
            copy_claude_credentials: false,
            github: {
              use_token_for_clone: true,
              git_user_name: "wreckit",
              git_user_email: "wreckit@users.noreply.github.com",
            },
            sync: {
              upload_paths: [],
              download_paths: [],
            },
          },
        },
      });

      const backend = await resolveBackend({
        root: tempDir,
        config,
        logger,
        repoSlug: "owner/repo",
      });

      expect(backend.name).toBe("sprites");
      expect(spritesCreateSpy).toHaveBeenCalledWith(
        tempDir,
        config.compute.sprites,
        config.limits,
        logger,
        "owner/repo"
      );
    });
  });

  describe("recursion guard", () => {
    it("forces LocalBackend when WRECKIT_EXEC_CONTEXT=sprite", async () => {
      process.env.WRECKIT_EXEC_CONTEXT = "sprite";

      const config = createConfig({
        compute: {
          backend: "sprites",
          sprites: {
            enabled: true,
            name_prefix: "wreckit",
            auto_delete: true,
            resume: true,
            workdir: "/var/local/wreckit",
            env_file: ".wreckit/.sprite.env",
            copy_claude_credentials: false,
            github: {
              use_token_for_clone: true,
              git_user_name: "wreckit",
              git_user_email: "wreckit@users.noreply.github.com",
            },
            sync: {
              upload_paths: [],
              download_paths: [],
            },
          },
        },
      });

      const backend = await resolveBackend({
        root: tempDir,
        config,
        logger,
        repoSlug: "owner/repo",
      });

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(logger.debug).toHaveBeenCalledWith(
        "Running inside sprite, forcing local backend"
      );
    });
  });
});
