import { describe, it, expect, beforeEach, afterEach, mock, vi, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import * as gitModule from "../../git";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

describe("git/quality", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let originalRunPrePushQualityGates: typeof gitModule.runPrePushQualityGates;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-quality-test-"));
    mockLogger = createMockLogger();
    // Store original to restore after each test
    originalRunPrePushQualityGates = gitModule.runPrePushQualityGates;
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("runPrePushQualityGates", () => {
    it("returns success when no checks are configured", async () => {
      const result = await gitModule.runPrePushQualityGates({
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
        checks: {
          commands: [],
          secret_scan: false,
          require_all_stories_done: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toContain("No commands configured");
    });

    it("returns success with skip info when no commands configured", async () => {
      const result = await gitModule.runPrePushQualityGates({
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
        checks: {
          commands: [],
          secret_scan: false,
          require_all_stories_done: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toContain("No commands configured");
    });

    it("skips execution in dryRun mode", async () => {
      const result = await gitModule.runPrePushQualityGates({
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
        checks: {
          commands: ["echo test"],
          secret_scan: false,
          require_all_stories_done: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe("scanForSecrets", () => {
    it("detects private keys", () => {
      const diff = `
+-----BEGIN RSA PRIVATE KEY-----
+MIIEpAIBAAKCAQEA2Z2...
+-----END RSA PRIVATE KEY-----
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "Private key")).toBe(true);
    });

    it("detects AWS access keys", () => {
      const diff = `
+const awsKey = "AKIA0123456789ABCDEF";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "AWS access key")).toBe(true);
    });

    it("detects GitHub personal access tokens", () => {
      const diff = `
+const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz123456";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "GitHub personal access token")).toBe(true);
    });

    it("detects GitHub PAT new format", () => {
      const diff = `
+const token = "github_pat_1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "GitHub personal access token")).toBe(true);
    });

    it("detects Slack tokens", () => {
      const diff = `
+const slackToken = "xoxb-test-token-for-testing-only-not-real";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "Slack token")).toBe(true);
    });

    it("detects passwords in assignments", () => {
      const diff = `
+const password = "mySecretPassword123";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "Password in assignment")).toBe(true);
    });

    it("detects API keys in assignments", () => {
      const diff = `
+const api_key = "sk-1234567890abcdef";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "API key in assignment")).toBe(true);
    });

    it("does not flag removed lines", () => {
      const diff = `
-----BEGIN RSA PRIVATE KEY-----
-MIIEpAIBAAKCAQEA2Z2...
-----END RSA PRIVATE KEY-----
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(false);
      expect(result.secrets).toHaveLength(0);
    });

    it("does not flag diff metadata lines", () => {
      const diff = `
+++ b/src/config.ts
+const apiKey = "AKIA0123456789ABCDE"; // This should be flagged
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      // Should flag the actual added line, not the +++ metadata
      const flaggedLines = result.secrets.filter(s => s.line?.startsWith("+++"));
      expect(flaggedLines).toHaveLength(0);
    });

    it("returns found: false when no secrets are present", () => {
      const diff = `
+const foo = "bar";
+function baz() {
+  return "hello world";
+}
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(false);
      expect(result.secrets).toHaveLength(0);
    });

    it("handles empty diff", () => {
      const result = gitModule.scanForSecrets("");

      expect(result.found).toBe(false);
      expect(result.secrets).toHaveLength(0);
    });

    it("detects bearer tokens", () => {
      const diff = `
+const auth = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets.some(s => s.pattern === "Bearer token")).toBe(true);
    });

    it("includes line numbers in results", () => {
      const diff = `line 1
+const password = "secret123";
line 3`;
      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets[0].lineNumber).toBeDefined();
      expect(result.secrets[0].lineNumber).toBe(2);
    });

    it("truncates long lines", () => {
      const longLine = "+const password = \"" + "x".repeat(200) + "\";";
      const diff = longLine;

      const result = gitModule.scanForSecrets(diff);

      expect(result.found).toBe(true);
      expect(result.secrets[0].line?.length).toBeLessThanOrEqual(100);
    });
  });
});
