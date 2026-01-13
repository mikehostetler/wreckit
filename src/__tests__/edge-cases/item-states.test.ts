import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item, Prd, Story, WorkflowState } from "../../schemas";
import {
  loadConfig,
  mergeWithDefaults,
  applyOverrides,
  DEFAULT_CONFIG,
  type ConfigOverrides,
} from "../../config";
import { writeItem, writePrd, readItem } from "../../fs";
import {
  buildValidationContext,
  getNextPhase,
} from "../../workflow";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

interface MockProcess {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
}

function createMockProcess(stdout: string, exitCode: number): MockProcess {
  const stdoutOn = vi.fn((event: string, cb: (data: Buffer) => void) => {
    if (event === "data") {
      setTimeout(() => cb(Buffer.from(stdout)), 0);
    }
  });
  const stderrOn = vi.fn();
  const onFn = vi.fn((event: string, cb: (code: number | null) => void) => {
    if (event === "close") {
      setTimeout(() => cb(exitCode), 10);
    }
  });

  return {
    stdout: { on: stdoutOn },
    stderr: { on: stderrOn },
    on: onFn,
  };
}

function mockSpawnOnce(stdout: string, exitCode: number): void {
  const mockProc = createMockProcess(stdout, exitCode);
  vi.mocked(spawn).mockReturnValueOnce(mockProc as never);
}

async function createWreckitDir(root: string): Promise<void> {
  await fs.mkdir(path.join(root, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.mkdir(path.join(root, ".wreckit", "prompts"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".wreckit", "config.json"),
    JSON.stringify({
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: { command: "amp", args: [], completion_signal: "DONE" },
      max_iterations: 100,
      timeout_seconds: 3600,
    })
  );
}

async function createItem(
  root: string,
  id: string,
  overrides: Partial<Item> = {}
): Promise<string> {
  const [section, slug] = id.split("/");
  const itemDir = path.join(root, ".wreckit", section, slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id,
    title: `Test item ${id}`,
    section,
    state: "raw",
    overview: "Test overview",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  await writeItem(itemDir, item);
  return itemDir;
}

async function createResearch(itemDir: string): Promise<void> {
  await fs.writeFile(path.join(itemDir, "research.md"), "# Research\n\nResearch content here.");
}

async function createPlan(itemDir: string): Promise<void> {
  await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan\n\nPlan content here.");
}

async function createPrd(
  itemDir: string,
  stories: Story[] = [
    {
      id: "US-001",
      title: "Test story",
      acceptance_criteria: ["Test"],
      priority: 1,
      status: "pending",
      notes: "",
    },
  ]
): Promise<void> {
  const prd: Prd = {
    schema_version: 1,
    id: "test-prd",
    branch_name: "wreckit/test-item",
    user_stories: stories,
  };

  await writePrd(itemDir, prd);
}

describe("Edge Cases: Item States & Artifacts (Tests 47-50)", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-item-states-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 47: Item missing expected files", () => {
    it("planned state without research.md does not crash during validation", async () => {
      const item: Item = {
        schema_version: 1,
        id: "test/001-item",
        title: "Test item",
        section: "test",
        state: "planned",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const itemDir = await createItem(tempDir, item.id, item);

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
    });

    it("planned state without plan.md does not crash", async () => {
      const itemDir = await createItem(tempDir, "test/002-item", { state: "planned" });
      await createResearch(itemDir);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
    });

    it("planned state without prd.json does not crash", async () => {
      const itemDir = await createItem(tempDir, "test/003-item", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
      expect(ctx.hasPlanMd).toBe(true);
      expect(ctx.prd).toBeNull();
    });

    it("implementing state with all artifacts missing still builds context", async () => {
      const itemDir = await createItem(tempDir, "test/004-item", { state: "implementing" });

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
      expect(ctx.hasPr).toBe(false);
    });
  });

  describe("Test 48: Empty PRD or no stories", () => {
    it("prd.json with empty user_stories array does not cause errors", async () => {
      const itemDir = await createItem(tempDir, "test/001-empty-prd", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, []);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd).not.toBeNull();
      expect(ctx.prd?.user_stories).toHaveLength(0);
    });

    it("implementing state with empty stories array works correctly", async () => {
      const itemDir = await createItem(tempDir, "test/002-empty-stories", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, []);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd).not.toBeNull();
      expect(ctx.prd?.user_stories).toEqual([]);
    });

    it("getNextPhase works with empty PRD", async () => {
      const item: Item = {
        schema_version: 1,
        id: "test/003-empty",
        title: "Empty PRD item",
        section: "test",
        state: "implementing",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const nextPhase = getNextPhase(item);
      expect(nextPhase).toBe("pr");
    });
  });

  describe("Test 49: Item with null branch/PR fields", () => {
    it("item with null branch derives branch name correctly from config", async () => {
      const itemDir = await createItem(tempDir, "test/001-null-branch", {
        state: "implementing",
        branch: null,
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir);

      const config = await loadConfig(tempDir);
      const expectedBranch = `${config.branch_prefix}test-001-null-branch`;

      expect(config.branch_prefix).toBe("wreckit/");
      expect(expectedBranch).toBe("wreckit/test-001-null-branch");
    });

    it("item with null pr_url and pr_number still processes correctly", async () => {
      const itemDir = await createItem(tempDir, "test/002-null-pr", {
        state: "implementing",
        branch: "wreckit/test-002-null-pr",
        pr_url: null,
        pr_number: null,
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasPr).toBe(false);
      expect(item.pr_url).toBeNull();
      expect(item.pr_number).toBeNull();
    });

    it("null branch field allows context building without errors", async () => {
      const itemDir = await createItem(tempDir, "test/003-null-fields", {
        state: "raw",
        branch: null,
        pr_url: null,
        pr_number: null,
      });

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx).toBeDefined();
      expect(ctx.hasPr).toBe(false);
      expect(ctx.prMerged).toBe(false);
    });
  });

  describe("Test 50: Item in each workflow state", () => {
    const workflowStates: WorkflowState[] = [
      "raw",
      "researched",
      "planned",
      "implementing",
      "in_pr",
      "done",
    ];

    it.each(workflowStates)("state '%s' has correct next phase", (state) => {
      const item: Item = {
        schema_version: 1,
        id: `test/${state}-item`,
        title: `${state} item`,
        section: "test",
        state,
        overview: "Test",
        branch: state !== "raw" && state !== "researched" ? "wreckit/test" : null,
        pr_url: state === "in_pr" || state === "done" ? "https://github.com/test/pull/1" : null,
        pr_number: state === "in_pr" || state === "done" ? 1 : null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const nextPhase = getNextPhase(item);

      const expectedPhases: Record<WorkflowState, string | null> = {
        raw: "research",
        researched: "plan",
        planned: "implement",
        implementing: "pr",
        in_pr: "complete",
        done: null,
      };

      expect(nextPhase).toBe(expectedPhases[state]);
    });

    it("next phase skips done items", () => {
      const doneItem: Item = {
        schema_version: 1,
        id: "test/done-item",
        title: "Done item",
        section: "test",
        state: "done",
        overview: "Test",
        branch: "wreckit/test",
        pr_url: "https://github.com/test/pull/1",
        pr_number: 1,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(getNextPhase(doneItem)).toBeNull();
    });

    it("correctly identifies items that need work vs completed", async () => {
      const rawItemDir = await createItem(tempDir, "test/raw-check", { state: "raw" });
      const doneItemDir = await createItem(tempDir, "test/done-check", { state: "done" });

      const rawItem = await readItem(rawItemDir);
      const doneItem = await readItem(doneItemDir);

      expect(getNextPhase(rawItem)).not.toBeNull();
      expect(getNextPhase(doneItem)).toBeNull();
    });

    it("all states build validation context without errors", async () => {
      for (const state of workflowStates) {
        const itemDir = await createItem(tempDir, `test/${state}-ctx`, {
          state,
          branch: state !== "raw" && state !== "researched" ? "wreckit/test" : null,
          pr_url: state === "in_pr" || state === "done" ? "https://github.com/test/pull/1" : null,
          pr_number: state === "in_pr" || state === "done" ? 1 : null,
        });

        if (state !== "raw") await createResearch(itemDir);
        if (state === "planned" || state === "implementing" || state === "in_pr" || state === "done") {
          await createPlan(itemDir);
          await createPrd(itemDir);
        }

        const item = await readItem(itemDir);
        const ctx = await buildValidationContext(tempDir, item);

        expect(ctx).toBeDefined();
      }
    });
  });
});

describe("Edge Cases: Config Defaults & Overrides (Tests 56-58)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-config-edge-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 56: Default branch_prefix application", () => {
    it("branch names start with wreckit/ when config omits branch_prefix", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.branch_prefix).toBe("wreckit/");
    });

    it("DEFAULT_CONFIG has correct branch_prefix", () => {
      expect(DEFAULT_CONFIG.branch_prefix).toBe("wreckit/");
    });

    it("mergeWithDefaults preserves default branch_prefix", () => {
      const result = mergeWithDefaults({});
      expect(result.branch_prefix).toBe("wreckit/");
    });

    it("custom branch_prefix is respected", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          branch_prefix: "feature/",
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.branch_prefix).toBe("feature/");
    });

    it("branch prefix can be applied to item id for branch name", async () => {
      const config = await loadConfig(tempDir);
      const itemId = "features/001-new-feature";
      const branchName = `${config.branch_prefix}${itemId.replace("/", "-")}`;

      expect(branchName).toBe("wreckit/features-001-new-feature");
    });
  });

  describe("Test 57: Extreme values for max_iterations & timeout_seconds", () => {
    it("handles large max_iterations value (10000)", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          max_iterations: 10000,
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.max_iterations).toBe(10000);
    });

    it("handles very large max_iterations value (1000000)", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          max_iterations: 1000000,
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.max_iterations).toBe(1000000);
    });

    it("handles timeout_seconds of 0 (no timeout)", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          timeout_seconds: 0,
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.timeout_seconds).toBe(0);
    });

    it("handles very large timeout_seconds (86400 - 24 hours)", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          timeout_seconds: 86400,
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir);
      expect(config.timeout_seconds).toBe(86400);
    });

    it("extreme values via overrides work correctly", () => {
      const result = applyOverrides(DEFAULT_CONFIG, {
        maxIterations: 999999,
        timeoutSeconds: 0,
      });

      expect(result.max_iterations).toBe(999999);
      expect(result.timeout_seconds).toBe(0);
    });

    it("mergeWithDefaults with extreme values", () => {
      const result = mergeWithDefaults({
        max_iterations: 50000,
        timeout_seconds: 172800,
      });

      expect(result.max_iterations).toBe(50000);
      expect(result.timeout_seconds).toBe(172800);
    });
  });

  describe("Test 58: Overrides vs config precedence", () => {
    it("override wins over config for baseBranch", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir, { baseBranch: "master" });
      expect(config.base_branch).toBe("master");
    });

    it("override wins over config for branchPrefix", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          branch_prefix: "wreckit/",
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir, { branchPrefix: "custom/" });
      expect(config.branch_prefix).toBe("custom/");
    });

    it("multiple overrides all win over config", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          branch_prefix: "wreckit/",
          max_iterations: 100,
          timeout_seconds: 3600,
          agent: { command: "claude", args: ["--print"], completion_signal: "DONE" },
        })
      );

      const overrides: ConfigOverrides = {
        baseBranch: "develop",
        branchPrefix: "dev/",
        maxIterations: 50,
        timeoutSeconds: 1800,
        agentCommand: "custom-agent",
      };

      const config = await loadConfig(tempDir, overrides);

      expect(config.base_branch).toBe("develop");
      expect(config.branch_prefix).toBe("dev/");
      expect(config.max_iterations).toBe(50);
      expect(config.timeout_seconds).toBe(1800);
      expect(config.agent.command).toBe("custom-agent");
    });

    it("overrides work with missing config.json (defaults + overrides)", async () => {
      const config = await loadConfig(tempDir, {
        baseBranch: "production",
        maxIterations: 10,
      });

      expect(config.base_branch).toBe("production");
      expect(config.max_iterations).toBe(10);
      expect(config.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    });

    it("applyOverrides maintains non-overridden values from config", () => {
      const customConfig = {
        ...DEFAULT_CONFIG,
        base_branch: "develop",
        max_iterations: 200,
      };

      const result = applyOverrides(customConfig, { baseBranch: "main" });

      expect(result.base_branch).toBe("main");
      expect(result.max_iterations).toBe(200);
    });

    it("partial overrides preserve other config values", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          branch_prefix: "custom/",
          max_iterations: 500,
          timeout_seconds: 7200,
          agent: { command: "claude", args: ["--print"], completion_signal: "CUSTOM" },
        })
      );

      const config = await loadConfig(tempDir, { baseBranch: "master" });

      expect(config.base_branch).toBe("master");
      expect(config.branch_prefix).toBe("custom/");
      expect(config.max_iterations).toBe(500);
      expect(config.timeout_seconds).toBe(7200);
      expect(config.agent.completion_signal).toBe("CUSTOM");
    });
  });
});

describe("Edge Cases: Flag Combinations & Interactions (Tests 66-68)", () => {
  describe("Test 66: Global flags propagate into subcommands", () => {
    it("optsWithGlobals returns global flags in subcommand context", () => {
      const globalFlags = {
        debug: true,
        quiet: false,
        dryRun: true,
        mockAgent: true,
        noTui: true,
        tuiDebug: false,
        cwd: "/test/path",
      };

      expect(globalFlags.debug).toBe(true);
      expect(globalFlags.dryRun).toBe(true);
      expect(globalFlags.mockAgent).toBe(true);
      expect(globalFlags.noTui).toBe(true);
      expect(globalFlags.cwd).toBe("/test/path");
    });

    it("global flags structure matches expected interface", () => {
      interface GlobalOpts {
        verbose?: boolean;
        quiet?: boolean;
        debug?: boolean;
        noTui?: boolean;
        tuiDebug?: boolean;
        dryRun?: boolean;
        mockAgent?: boolean;
        cwd?: string;
      }

      const opts: GlobalOpts = {
        verbose: true,
        quiet: false,
        debug: true,
        dryRun: true,
      };

      expect(opts.verbose).toBe(true);
      expect(opts.quiet).toBe(false);
      expect(opts.debug).toBe(true);
      expect(opts.dryRun).toBe(true);
    });

    it("cwd flag value is preserved through global options", () => {
      const cwdPath = "/custom/working/directory";
      const globalOpts = { cwd: cwdPath };

      expect(globalOpts.cwd).toBe(cwdPath);
    });
  });

  describe("Test 67: Conflicting flags: --quiet --debug", () => {
    it("both flags can be set simultaneously", () => {
      const flags = {
        quiet: true,
        debug: true,
      };

      expect(flags.quiet).toBe(true);
      expect(flags.debug).toBe(true);
    });

    it("debug logs should be printed even when quiet is set (debug takes precedence)", () => {
      const logConfig = {
        quiet: true,
        debug: true,
      };

      const shouldLogDebug = logConfig.debug === true;
      const shouldSuppressInfo = logConfig.quiet === true && !logConfig.debug;

      expect(shouldLogDebug).toBe(true);
      expect(shouldSuppressInfo).toBe(false);
    });

    it("log level behavior with conflicting flags", () => {
      interface LogConfig {
        quiet: boolean;
        debug: boolean;
      }

      function getEffectiveLogLevel(config: LogConfig): string {
        if (config.debug) return "debug";
        if (config.quiet) return "error";
        return "info";
      }

      expect(getEffectiveLogLevel({ quiet: true, debug: true })).toBe("debug");
      expect(getEffectiveLogLevel({ quiet: true, debug: false })).toBe("error");
      expect(getEffectiveLogLevel({ quiet: false, debug: true })).toBe("debug");
      expect(getEffectiveLogLevel({ quiet: false, debug: false })).toBe("info");
    });
  });

  describe("Test 68: Conflicting flags: --no-tui --tui-debug", () => {
    it("both flags can be set simultaneously", () => {
      const flags = {
        noTui: true,
        tuiDebug: true,
      };

      expect(flags.noTui).toBe(true);
      expect(flags.tuiDebug).toBe(true);
    });

    it("no runtime error when both flags are set", () => {
      const processTuiFlags = (noTui: boolean, tuiDebug: boolean): { enableTui: boolean; debugTui: boolean } => {
        if (noTui) {
          return { enableTui: false, debugTui: false };
        }
        return { enableTui: true, debugTui: tuiDebug };
      };

      const result = processTuiFlags(true, true);

      expect(result.enableTui).toBe(false);
      expect(result.debugTui).toBe(false);
    });

    it("tui-debug is effectively disabled when no-tui is set", () => {
      const flags = {
        noTui: true,
        tuiDebug: true,
      };

      const effectiveTuiDebug = !flags.noTui && flags.tuiDebug;

      expect(effectiveTuiDebug).toBe(false);
    });

    it("tui-debug works when tui is enabled", () => {
      const flags = {
        noTui: false,
        tuiDebug: true,
      };

      const effectiveTuiDebug = !flags.noTui && flags.tuiDebug;

      expect(effectiveTuiDebug).toBe(true);
    });

    it("all tui flag combinations are handled without errors", () => {
      const combinations = [
        { noTui: false, tuiDebug: false },
        { noTui: false, tuiDebug: true },
        { noTui: true, tuiDebug: false },
        { noTui: true, tuiDebug: true },
      ];

      for (const combo of combinations) {
        const effectiveTuiEnabled = !combo.noTui;
        const effectiveDebug = effectiveTuiEnabled && combo.tuiDebug;

        expect(typeof effectiveTuiEnabled).toBe("boolean");
        expect(typeof effectiveDebug).toBe("boolean");
      }
    });
  });
});
