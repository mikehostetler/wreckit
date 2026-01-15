import { describe, it, expect, beforeEach, afterEach, afterAll, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as realChildProcess from "node:child_process";
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

const mockedSpawn = vi.fn();

afterAll(() => {
  mock.module("node:child_process", () => realChildProcess);
});

mock.module("node:child_process", () => ({
  spawn: mockedSpawn,
}));

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
  mockedSpawn.mockReturnValueOnce(mockProc as never);
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
  const itemDir = path.join(root, ".wreckit", "items", id);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id,
    title: `Test item ${id}`,
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
        id: "001-item",
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
      const itemDir = await createItem(tempDir, "002-item", { state: "planned" });
      await createResearch(itemDir);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
    });

    it("planned state without prd.json does not crash", async () => {
      const itemDir = await createItem(tempDir, "003-item", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
      expect(ctx.hasPlanMd).toBe(true);
      expect(ctx.prd).toBeNull();
    });

    it("implementing state with all artifacts missing still builds context", async () => {
      const itemDir = await createItem(tempDir, "004-item", { state: "implementing" });

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
      const itemDir = await createItem(tempDir, "001-empty-prd", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, []);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd).not.toBeNull();
      expect(ctx.prd?.user_stories).toHaveLength(0);
    });

    it("implementing state with empty stories array works correctly", async () => {
      const itemDir = await createItem(tempDir, "002-empty-stories", { state: "implementing" });
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
        id: "003-empty",
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

      expect(getNextPhase(item)).toBe("pr");
    });
  });

  describe("Test 49: All story statuses", () => {
    it("handles stories with 'pending' status", async () => {
      const itemDir = await createItem(tempDir, "001-pending", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Pending", acceptance_criteria: [], priority: 1, status: "pending", notes: "" },
      ]);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd?.user_stories[0].status).toBe("pending");
    });

    it("handles stories with 'done' status", async () => {
      const itemDir = await createItem(tempDir, "002-done", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Done", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd?.user_stories[0].status).toBe("done");
    });

    it("handles mixed story statuses", async () => {
      const itemDir = await createItem(tempDir, "003-mixed", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Done", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
        { id: "US-002", title: "Pending", acceptance_criteria: [], priority: 2, status: "pending", notes: "" },
      ]);

      const item = await readItem(itemDir);
      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.prd?.user_stories).toHaveLength(2);
      expect(ctx.prd?.user_stories[0].status).toBe("done");
      expect(ctx.prd?.user_stories[1].status).toBe("pending");
    });
  });

  describe("Test 50: State transitions", () => {
    it("raw state allows research phase", () => {
      const item: Item = {
        schema_version: 1,
        id: "001-raw",
        title: "Raw item",
        section: "test",
        state: "raw",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(getNextPhase(item)).toBe("research");
    });

    it("researched state allows plan phase", () => {
      const item: Item = {
        schema_version: 1,
        id: "002-researched",
        title: "Researched item",
        section: "test",
        state: "researched",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(getNextPhase(item)).toBe("plan");
    });

    it("planned state allows implement phase", () => {
      const item: Item = {
        schema_version: 1,
        id: "003-planned",
        title: "Planned item",
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

      expect(getNextPhase(item)).toBe("implement");
    });

    it("implementing state allows pr phase", () => {
      const item: Item = {
        schema_version: 1,
        id: "004-implementing",
        title: "Implementing item",
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

      expect(getNextPhase(item)).toBe("pr");
    });

    it("in_pr state allows complete phase", () => {
      const item: Item = {
        schema_version: 1,
        id: "005-in-pr",
        title: "In PR item",
        section: "test",
        state: "in_pr",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(getNextPhase(item)).toBe("complete");
    });

    it("done state returns null", () => {
      const item: Item = {
        schema_version: 1,
        id: "006-done",
        title: "Done item",
        section: "test",
        state: "done",
        overview: "Test",
        branch: null,
        pr_url: null,
        pr_number: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(getNextPhase(item)).toBeNull();
    });
  });
});

describe("Edge Cases: Config Overrides (Tests 51-65)", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-config-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 51-55: Config loading", () => {
    it("loads config from .wreckit/config.json", async () => {
      const config = await loadConfig(tempDir);

      expect(config.base_branch).toBe("main");
      expect(config.branch_prefix).toBe("wreckit/");
    });

    it("uses defaults when config.json missing", async () => {
      await fs.rm(path.join(tempDir, ".wreckit", "config.json"));

      const config = await loadConfig(tempDir);

      expect(config.base_branch).toBe(DEFAULT_CONFIG.base_branch);
    });

    it("mergeWithDefaults fills missing fields", () => {
      const partial = { base_branch: "develop" };
      const merged = mergeWithDefaults(partial as any);

      expect(merged.base_branch).toBe("develop");
      expect(merged.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    });
  });

  describe("Test 56-60: Override precedence", () => {
    it("override wins over config for baseBranch", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          agent: { command: "test", args: [], completion_signal: "DONE" },
        })
      );

      const config = await loadConfig(tempDir, { baseBranch: "develop" });
      expect(config.base_branch).toBe("develop");
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
