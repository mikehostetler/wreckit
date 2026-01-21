import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadSpriteEnv,
  validateSpriteEnv,
  parseSpriteEnvFile,
} from "../../compute/sprites";

describe("parseSpriteEnvFile", () => {
  test("parses simple KEY=value format", () => {
    const content = `SPRITE_TOKEN=abc123
GITHUB_TOKEN=ghp_xxx`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc123",
      GITHUB_TOKEN: "ghp_xxx",
    });
  });

  test("parses double-quoted values", () => {
    const content = `SPRITE_TOKEN="abc 123"
GITHUB_TOKEN="value with spaces"`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc 123",
      GITHUB_TOKEN: "value with spaces",
    });
  });

  test("parses single-quoted values", () => {
    const content = `SPRITE_TOKEN='abc 123'`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc 123",
    });
  });

  test("ignores comments", () => {
    const content = `# This is a comment
SPRITE_TOKEN=abc123
# Another comment
GITHUB_TOKEN=ghp_xxx`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc123",
      GITHUB_TOKEN: "ghp_xxx",
    });
  });

  test("ignores empty lines", () => {
    const content = `SPRITE_TOKEN=abc123

GITHUB_TOKEN=ghp_xxx

`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc123",
      GITHUB_TOKEN: "ghp_xxx",
    });
  });

  test("ignores lines without equals sign", () => {
    const content = `SPRITE_TOKEN=abc123
INVALID_LINE
GITHUB_TOKEN=ghp_xxx`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc123",
      GITHUB_TOKEN: "ghp_xxx",
    });
  });

  test("handles values with equals signs", () => {
    const content = `MY_VAR=value=with=equals`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      MY_VAR: "value=with=equals",
    });
  });

  test("handles empty values", () => {
    const content = `EMPTY_VAR=`;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      EMPTY_VAR: "",
    });
  });

  test("trims whitespace around keys and values", () => {
    const content = `  SPRITE_TOKEN  =  abc123  `;
    const result = parseSpriteEnvFile(content);
    expect(result).toEqual({
      SPRITE_TOKEN: "abc123",
    });
  });
});

describe("loadSpriteEnv", () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprite-env-test-"));
    await fs.mkdir(path.join(tmpDir, ".wreckit"), { recursive: true });
    originalEnv = { ...process.env };
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("loads from .sprite.env file", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".wreckit", ".sprite.env"),
      `SPRITE_TOKEN=sprite-token-value
GITHUB_TOKEN=github-token-value`
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("sprite-token-value");
    expect(env.GITHUB_TOKEN).toBe("github-token-value");
  });

  test("loads from config.local.json agent.env", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".wreckit", "config.local.json"),
      JSON.stringify({
        agent: {
          env: {
            SPRITE_TOKEN: "config-sprite-token",
            GITHUB_TOKEN: "config-github-token",
          },
        },
      })
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("config-sprite-token");
    expect(env.GITHUB_TOKEN).toBe("config-github-token");
  });

  test("sprite.env takes precedence over process.env", async () => {
    process.env.SPRITE_TOKEN = "process-sprite-token";
    process.env.GITHUB_TOKEN = "process-github-token";

    await fs.writeFile(
      path.join(tmpDir, ".wreckit", ".sprite.env"),
      `SPRITE_TOKEN=sprite-env-token`
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("sprite-env-token");
    expect(env.GITHUB_TOKEN).toBe("process-github-token");
  });

  test("process.env takes precedence over config.local.json", async () => {
    process.env.SPRITE_TOKEN = "process-sprite-token";

    await fs.writeFile(
      path.join(tmpDir, ".wreckit", "config.local.json"),
      JSON.stringify({
        agent: {
          env: {
            SPRITE_TOKEN: "config-sprite-token",
            GITHUB_TOKEN: "config-github-token",
          },
        },
      })
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("process-sprite-token");
    expect(env.GITHUB_TOKEN).toBe("config-github-token");
  });

  test("full precedence: sprite.env > process.env > config.local.json", async () => {
    process.env.SPRITE_TOKEN = "process-sprite-token";
    process.env.GITHUB_TOKEN = "process-github-token";
    process.env.EXTRA_VAR = "process-extra";

    await fs.writeFile(
      path.join(tmpDir, ".wreckit", "config.local.json"),
      JSON.stringify({
        agent: {
          env: {
            SPRITE_TOKEN: "config-sprite-token",
            GITHUB_TOKEN: "config-github-token",
            EXTRA_VAR: "config-extra",
            CONFIG_ONLY: "config-only-value",
          },
        },
      })
    );

    await fs.writeFile(
      path.join(tmpDir, ".wreckit", ".sprite.env"),
      `SPRITE_TOKEN=sprite-env-token`
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("sprite-env-token");
    expect(env.GITHUB_TOKEN).toBe("process-github-token");
    expect(env.EXTRA_VAR).toBe("process-extra");
    expect(env.CONFIG_ONLY).toBe("config-only-value");
  });

  test("handles missing .sprite.env file", async () => {
    process.env.SPRITE_TOKEN = "process-sprite-token";
    process.env.GITHUB_TOKEN = "process-github-token";

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("process-sprite-token");
    expect(env.GITHUB_TOKEN).toBe("process-github-token");
  });

  test("handles missing config.local.json file", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".wreckit", ".sprite.env"),
      `SPRITE_TOKEN=sprite-token
GITHUB_TOKEN=github-token`
    );

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("sprite-token");
    expect(env.GITHUB_TOKEN).toBe("github-token");
  });

  test("handles empty files", async () => {
    await fs.writeFile(path.join(tmpDir, ".wreckit", ".sprite.env"), "");
    await fs.writeFile(
      path.join(tmpDir, ".wreckit", "config.local.json"),
      "{}"
    );

    process.env.SPRITE_TOKEN = "fallback-sprite";
    process.env.GITHUB_TOKEN = "fallback-github";

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("fallback-sprite");
    expect(env.GITHUB_TOKEN).toBe("fallback-github");
  });

  test("handles config.local.json without agent.env", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".wreckit", "config.local.json"),
      JSON.stringify({ some_other_key: "value" })
    );

    process.env.SPRITE_TOKEN = "process-sprite";
    process.env.GITHUB_TOKEN = "process-github";

    const env = await loadSpriteEnv(tmpDir);
    expect(env.SPRITE_TOKEN).toBe("process-sprite");
    expect(env.GITHUB_TOKEN).toBe("process-github");
  });
});

describe("validateSpriteEnv", () => {
  test("returns valid when all required tokens present", () => {
    const env = {
      SPRITE_TOKEN: "sprite-token",
      GITHUB_TOKEN: "github-token",
    };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("returns invalid when SPRITE_TOKEN is missing", () => {
    const env = {
      SPRITE_TOKEN: "",
      GITHUB_TOKEN: "github-token",
    };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("SPRITE_TOKEN");
  });

  test("returns invalid when GITHUB_TOKEN is missing", () => {
    const env = {
      SPRITE_TOKEN: "sprite-token",
      GITHUB_TOKEN: "",
    };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("GITHUB_TOKEN");
  });

  test("returns invalid when both tokens are missing", () => {
    const env = {
      SPRITE_TOKEN: "",
      GITHUB_TOKEN: "",
    };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("SPRITE_TOKEN");
    expect(result.missing).toContain("GITHUB_TOKEN");
  });

  test("returns invalid when tokens are undefined", () => {
    const env = {} as { SPRITE_TOKEN: string; GITHUB_TOKEN: string };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("SPRITE_TOKEN");
    expect(result.missing).toContain("GITHUB_TOKEN");
  });

  test("allows extra environment variables", () => {
    const env = {
      SPRITE_TOKEN: "sprite-token",
      GITHUB_TOKEN: "github-token",
      EXTRA_VAR: "extra-value",
    };

    const result = validateSpriteEnv(env);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
