import { describe, it, expect, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item, Prd } from "../schemas";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentResult } from "../agent/runner";
// Import real git module for passthrough in mock
import * as gitModule from "../git";

const mockedRunAgent = vi.fn();
const mockedGetAgentConfig = vi.fn((config: ConfigResolved) => ({
  command: config.agent.command,
  args: config.agent.args,
  completion_signal: config.agent.completion_signal,
  timeout_seconds: config.timeout_seconds,
  max_iterations: config.max_iterations,
}));

mock.module("../agent/runner", () => ({
  runAgent: mockedRunAgent,
  getAgentConfig: mockedGetAgentConfig,
}));

const mockedEnsureBranch = vi.fn(() =>
  Promise.resolve({ branchName: "wreckit/001-test-feature", created: true })
);
const mockedHasUncommittedChanges = vi.fn(() => Promise.resolve(false));
const mockedCommitAll = vi.fn(() => Promise.resolve());
const mockedPushBranch = vi.fn(() => Promise.resolve());
const mockedCreateOrUpdatePr = vi.fn(() =>
  Promise.resolve({
    url: "https://github.com/example/repo/pull/42",
    number: 42,
    created: true,
  })
);
const mockedIsPrMerged = vi.fn(() => Promise.resolve(true));
const mockedCheckGitPreflight = vi.fn(() =>
  Promise.resolve({ valid: true, errors: [] })
);
const mockedIsGitRepo = vi.fn(() => Promise.resolve(true));
const mockedGetCurrentBranch = vi.fn(() => Promise.resolve("wreckit/001-test-feature"));
const mockedGetBranchSha = vi.fn(() => Promise.resolve("abc123"));
const mockedMergeAndPushToBase = vi.fn(() => Promise.resolve());

mock.module("../git", () => ({
  ensureBranch: mockedEnsureBranch,
  hasUncommittedChanges: mockedHasUncommittedChanges,
  commitAll: mockedCommitAll,
  pushBranch: mockedPushBranch,
  createOrUpdatePr: mockedCreateOrUpdatePr,
  isPrMerged: mockedIsPrMerged,
  checkGitPreflight: mockedCheckGitPreflight,
  isGitRepo: mockedIsGitRepo,
  getCurrentBranch: mockedGetCurrentBranch,
  getBranchSha: mockedGetBranchSha,
  mergeAndPushToBase: mockedMergeAndPushToBase,
  // Pass through real implementations for functions used by git-status-comparison.test.ts and quality.test.ts
  compareGitStatus: gitModule.compareGitStatus,
  getGitStatus: gitModule.getGitStatus,
  parseGitStatusPorcelain: gitModule.parseGitStatusPorcelain,
  formatViolations: gitModule.formatViolations,
  // Pass through quality module for quality.test.ts - these will pass with default empty config
  runPrePushQualityGates: gitModule.runPrePushQualityGates,
  runQualityChecks: gitModule.runQualityChecks,
  runSecretScan: gitModule.runSecretScan,
  scanForSecrets: gitModule.scanForSecrets,
  // Also pass through other functions that might be imported
  runGitCommand: gitModule.runGitCommand,
  runGhCommand: gitModule.runGhCommand,
  branchExists: gitModule.branchExists,
  getPrByBranch: gitModule.getPrByBranch,
  isDetachedHead: gitModule.isDetachedHead,
  hasRemote: gitModule.hasRemote,
  getBranchSyncStatus: gitModule.getBranchSyncStatus,
}));

const {
  buildValidationContext,
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhasePr,
  runPhaseComplete,
  getNextPhase,
} = await import("../workflow");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createTestConfig(): ConfigResolved {
  return {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    agent: {
      command: "test-agent",
      args: [],
      completion_signal: "<promise>COMPLETE</promise>",
      mode: "sdk",
    },
    max_iterations: 10,
    timeout_seconds: 60,
    merge_mode: "pr",
    pr_checks: {
      commands: [],
      secret_scan: false,
      require_all_stories_done: true,
      allow_unsafe_direct_merge: false,
    },
  };
}

function createTestItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "001-test-feature",
    title: "Test Feature",
    state: "idea",
    overview: "A test feature",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2025-01-12T00:00:00Z",
    updated_at: "2025-01-12T00:00:00Z",
    rollback_sha: null,
    ...overrides,
  };
}

function createTestPrd(overrides: Partial<Prd> = {}): Prd {
  return {
    schema_version: 1,
    id: "001-test-feature",
    branch_name: "wreckit/001-test-feature",
    user_stories: [
      {
        id: "US-001",
        title: "First story",
        acceptance_criteria: ["Criterion 1", "Criterion 2"],
        priority: 1,
        status: "pending",
        notes: "",
      },
    ],
    ...overrides,
  };
}

function createTestPlanContent(): string {
  return `# Implementation Plan: Test Feature

## Implementation Plan Title
Test Feature Implementation

## Overview
This plan describes the implementation of a test feature.

## Current State
The feature does not currently exist in the system.

## Desired End State
The feature will be fully implemented and tested.

## What We're NOT Doing
We are not implementing any additional features beyond the core requirements.

## Implementation Approach
We will implement the feature using TypeScript following the project's existing patterns.

## Phases

### Phase 1: Core Implementation
Implement the core functionality of the feature.

## Testing Strategy
We will use unit tests and integration tests to verify the implementation.
`;
}

interface MockAgentBehavior {
  createFiles?: Record<string, string>;
  updatePrd?: (prd: Prd) => Prd;
  success?: boolean;
  timedOut?: boolean;
}

function createMockAgentResult(
  behavior: MockAgentBehavior,
  itemDir: string
): () => Promise<AgentResult> {
  return async () => {
    if (behavior.createFiles) {
      for (const [filename, content] of Object.entries(behavior.createFiles)) {
        const filePath = path.join(itemDir, filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
      }
    }

    if (behavior.updatePrd) {
      const prdPath = path.join(itemDir, "prd.json");
      try {
        const prdContent = await fs.readFile(prdPath, "utf-8");
        const prd = JSON.parse(prdContent) as Prd;
        const updatedPrd = behavior.updatePrd(prd);
        await fs.writeFile(
          prdPath,
          JSON.stringify(updatedPrd, null, 2),
          "utf-8"
        );
      } catch {
        // prd doesn't exist yet, ignore
      }
    }

    return {
      success: behavior.success ?? true,
      output: "test output",
      timedOut: behavior.timedOut ?? false,
      exitCode: behavior.success === false ? 1 : 0,
      completionDetected: behavior.success ?? true,
    };
  };
}

describe("workflow", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let config: ConfigResolved;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-workflow-test-"));
    mockLogger = createMockLogger();
    config = createTestConfig();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function setupItem(item: Item): Promise<string> {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const itemDir = path.join(itemsDir, item.id);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(item, null, 2),
      "utf-8"
    );
    return itemDir;
  }

  async function readItemState(itemId: string): Promise<Item> {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const itemPath = path.join(itemsDir, itemId, "item.json");
    const content = await fs.readFile(itemPath, "utf-8");
    return JSON.parse(content) as Item;
  }

  describe("buildValidationContext", () => {
    it("returns correct flags based on file existence", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
      expect(ctx.hasPr).toBe(false);
      expect(ctx.prMerged).toBe(false);
    });

    it("detects research.md when present", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
    });

    it("detects plan.md and prd.json when present", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan", "utf-8");
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(createTestPrd(), null, 2),
        "utf-8"
      );

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasPlanMd).toBe(true);
      expect(ctx.prd).not.toBeNull();
    });

    it("handles missing files gracefully", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
    });
  });

  describe("runPhaseResearch", () => {
    it("transitions from raw to researched on success", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      const validResearchContent = `# Research: Test Feature

**Date**: 2025-01-19
**Item**: 001-test-feature

## Research Question
How should we implement this test feature?

## Summary

This feature requires adding a new endpoint to the API and updating the frontend to display the new data. The current architecture uses a RESTful API pattern with TypeScript throughout.

The backend is organized around services in \`src/services/\`, with routing handled in \`src/index.ts\`. Frontend components are in \`src/components/\`. State management uses a custom hook pattern.

## Current State Analysis

The main entry point is at \`src/index.ts:42\` where the app is initialized. Routes are registered at \`src/routes/index.ts:15-30\`.

The service layer follows a pattern established in \`src/services/userService.ts:1-100\` which can serve as a template for the new feature service.

Database models are defined in \`src/models/index.ts:1-50\` using TypeScript interfaces.

Frontend components are organized in \`src/components/\` with the main app at \`src/App.tsx:10\`.

State management is handled by custom hooks in \`src/hooks/\`, see \`src/hooks/useData.ts:1-50\`.

API integration uses \`src/api/client.ts:20-40\`.

## Key Files

- \`src/index.ts:42\` - Main application entry
- \`src/routes/index.ts:15-30\` - Route registration
- \`src/services/userService.ts:1-100\` - Example service implementation
- \`src/models/index.ts:1-50\` - Database models
- \`src/App.tsx:10\` - Frontend app root

## Technical Considerations

The project uses:
- Express.js for backend routing
- TypeScript for type safety
- React for frontend
- Custom hooks for state management

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing API | High | Add versioning to new endpoints |
| Frontend state issues | Medium | Follow existing hook patterns |
| Database migration | Medium | Use incremental migration scripts |

## Recommended Approach

1. Create new service in \`src/services/testFeatureService.ts\` following the pattern from \`userService.ts\`
2. Add routes in \`src/routes/\` and register in \`src/routes/index.ts\`
3. Update database models in \`src/models/index.ts\`
4. Create frontend components in \`src/components/testFeature/\`
5. Add custom hook in \`src/hooks/useTestFeature.ts\`
6. Integrate API calls using \`src/api/client.ts\`

## Open Questions

- Should the new endpoint use authentication? Current auth is at \`src/middleware/auth.ts:10-30\`
- Do we need database migrations or can we add columns directly?
- Should we add tests for the new service immediately?
`;

      mockedRunAgent.mockImplementation(
        createMockAgentResult(
          { createFiles: { "research.md": validResearchContent } },
          itemDir
        )
      );

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("researched");
    });

    it("fails when not in raw state", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("idea");
    });

    it("fails when research.md not created by agent", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: {} }, itemDir)
      );

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("research.md");
    });

    it("fails when research.md has insufficient quality (Gap 2)", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      const poorResearchContent = `# Research

## Research Question
How to add feature?

## Summary
Add a feature.

## Current State Analysis
The app exists.

## Key Files
Some files.

## Technical Considerations
Use TypeScript.

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Bugs | Tests |

## Recommended Approach
Write code.

## Open Questions
None.
`;

      mockedRunAgent.mockImplementation(
        createMockAgentResult(
          { createFiles: { "research.md": poorResearchContent } },
          itemDir
        )
      );

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Research quality validation failed");
      // Should fail due to insufficient citations and short summary
      expect(result.error).toMatch(/citation|Summary/);
    });
  });

  describe("runPhasePlan", () => {
    it("transitions from researched to planned on success", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      const prd = createTestPrd();
      mockedRunAgent.mockImplementation(
        createMockAgentResult(
          {
            createFiles: {
              "plan.md": createTestPlanContent(),
              "prd.json": JSON.stringify(prd, null, 2),
            },
          },
          itemDir
        )
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("planned");
    });

    it("fails when not in researched state", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("researched");
    });

    it("fails when plan.md not created", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: {} }, itemDir)
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("plan.md");
    });

    it("fails when prd.json not created", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: { "plan.md": createTestPlanContent() } }, itemDir)
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("prd.json");
    });

    describe("write containment enforcement (Gap 1)", () => {
      it("fails when agent modifies source files during planning", async () => {
        const item = createTestItem({ state: "researched" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "research.md"),
          "# Research",
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        const prd = createTestPrd();
        const wreckitPath = `.wreckit/items/${item.id}`;

        mockedRunAgent.mockImplementation(async () => {
          // Create allowed files in item directory
          await fs.mkdir(path.join(tempDir, wreckitPath), { recursive: true });
          await fs.writeFile(path.join(tempDir, wreckitPath, "plan.md"), createTestPlanContent(), "utf-8");
          await fs.writeFile(path.join(tempDir, wreckitPath, "prd.json"), JSON.stringify(prd, null, 2), "utf-8");
          // Create unauthorized file outside item directory
          await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
          await fs.writeFile(path.join(tempDir, "src", "unauthorized.ts"), "console.log('unauthorized');", "utf-8");
          return {
            success: true,
            output: "test output",
            timedOut: false,
            exitCode: 0,
            completionDetected: true,
          };
        });

        const result = await runPhasePlan(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("unauthorized");
        expect(result.error).toContain("src/");
        expect(result.error).toContain("plan phase");
      });

      it("fails when agent creates files outside item directory", async () => {
        const item = createTestItem({ state: "researched" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "research.md"),
          "# Research",
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        const prd = createTestPrd();
        const wreckitPath = `.wreckit/items/${item.id}`;

        mockedRunAgent.mockImplementation(async () => {
          // Create allowed files in item directory
          await fs.mkdir(path.join(tempDir, wreckitPath), { recursive: true });
          await fs.writeFile(path.join(tempDir, wreckitPath, "plan.md"), createTestPlanContent(), "utf-8");
          await fs.writeFile(path.join(tempDir, wreckitPath, "prd.json"), JSON.stringify(prd, null, 2), "utf-8");
          // Create unauthorized config file at repo root
          await fs.writeFile(path.join(tempDir, "config.json"), '{ "setting": "value" }', "utf-8");
          return {
            success: true,
            output: "test output",
            timedOut: false,
            exitCode: 0,
            completionDetected: true,
          };
        });

        const result = await runPhasePlan(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("unauthorized");
        expect(result.error).toContain("config.json");
        expect(result.error).toContain("plan phase");
      });

      it("succeeds when agent only writes allowed files (plan.md and prd.json)", async () => {
        const item = createTestItem({ state: "researched" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "research.md"),
          "# Research",
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        const prd = createTestPrd();
        mockedRunAgent.mockImplementation(
          createMockAgentResult(
            {
              createFiles: {
                "plan.md": createTestPlanContent(),
                "prd.json": JSON.stringify(prd, null, 2),
              },
            },
            itemDir
          )
        );

        const result = await runPhasePlan(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(true);
        expect(result.item.state).toBe("planned");
      });

      it("skips write containment check in dryRun mode", async () => {
        const item = createTestItem({ state: "researched" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "research.md"),
          "# Research",
          "utf-8"
        );

        // dryRun returns early without running any checks, so agent doesn't need to create files
        const result = await runPhasePlan(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
          dryRun: true,
        });

        expect(result.success).toBe(true);
      });

      it("skips write containment check in mockAgent mode", async () => {
        const item = createTestItem({ state: "researched" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "research.md"),
          "# Research",
          "utf-8"
        );

        const result = await runPhasePlan(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
          mockAgent: true,
        });

        expect(result.success).toBe(true);
        expect(result.item.state).toBe("planned");
      });
    });
  });

  describe("runPhaseImplement", () => {
    it("transitions from planned to implementing", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("implementing");
    });

    it("fails when not in planned or implementing state", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("planned");
    });

    it("fails when prd.json missing", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("prd");
    });

    it("updates story status after agent run", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      const prdPath = path.join(itemDir, "prd.json");
      const updatedPrd = JSON.parse(
        await fs.readFile(prdPath, "utf-8")
      ) as Prd;
      expect(updatedPrd.user_stories[0].status).toBe("done");
    });

    it("appends to progress.log", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      const progressPath = path.join(itemDir, "progress.log");
      const progressContent = await fs.readFile(progressPath, "utf-8");
      expect(progressContent).toContain("US-001");
    });

    it("respects max_iterations", async () => {
      const prd = createTestPrd({
        user_stories: Array.from({ length: 20 }, (_, i) => ({
          id: `US-${i + 1}`,
          title: `Story ${i + 1}`,
          acceptance_criteria: [],
          priority: i + 1,
          status: "pending" as const,
          notes: "",
        })),
      });
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const limitedConfig = { ...config, max_iterations: 3 };
      let callCount = 0;

      mockedRunAgent.mockImplementation(async () => {
        callCount++;
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config: limitedConfig,
        logger: mockLogger,
      });

      expect(callCount).toBe(3);
      expect(result.success).toBe(false);
      expect(result.error).toContain("max iterations");
    });

    it("handles timeout", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockResolvedValue({
        success: false,
        output: "",
        timedOut: true,
        exitCode: null,
        completionDetected: false,
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    describe("scope tracking (Gap 2)", () => {
      it("logs file changes during story implementation", async () => {
        const prd = createTestPrd();
        const item = createTestItem({ state: "planned" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        mockedRunAgent.mockImplementation(async () => {
          // Create source file changes
          await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
          await fs.writeFile(path.join(tempDir, "src", "feature.ts"), "export const feature = true;", "utf-8");
          // Update PRD to mark story as done
          const prdPath = path.join(itemDir, "prd.json");
          const currentPrd = JSON.parse(await fs.readFile(prdPath, "utf-8")) as Prd;
          currentPrd.user_stories[0].status = "done";
          await fs.writeFile(prdPath, JSON.stringify(currentPrd, null, 2), "utf-8");
          return {
            success: true,
            output: "test output",
            timedOut: false,
            exitCode: 0,
            completionDetected: true,
          };
        });

        const result = await runPhaseImplement(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(true);
        // Verify that file changes were logged
        const infoCalls = mockLogger.info.mock.calls;
        const logEntry = infoCalls.find((call: string[]) => call[0]?.includes("changed") && call[0]?.includes("file"));
        expect(logEntry).toBeDefined();
        expect(logEntry[0]).toContain("US-001");
        expect(logEntry[0]).toContain("changed");
      });

      it("warns when story modifies wreckit system files", async () => {
        const prd = createTestPrd();
        const item = createTestItem({ state: "planned" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        mockedRunAgent.mockImplementation(async () => {
          // Modify wreckit system file (config.json at root level)
          await fs.writeFile(path.join(tempDir, ".wreckit", "config.json"), '{ "modified": true }', "utf-8");
          // Update PRD to mark story as done
          const prdPath = path.join(itemDir, "prd.json");
          const currentPrd = JSON.parse(await fs.readFile(prdPath, "utf-8")) as Prd;
          currentPrd.user_stories[0].status = "done";
          await fs.writeFile(prdPath, JSON.stringify(currentPrd, null, 2), "utf-8");
          return {
            success: true,
            output: "test output",
            timedOut: false,
            exitCode: 0,
            completionDetected: true,
          };
        });

        const result = await runPhaseImplement(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(true);
        // Verify that warning was logged for wreckit system file modification
        const warnCalls = mockLogger.warn.mock.calls;
        const warnEntry = warnCalls.find((call: string[]) => call[0]?.includes("wreckit system files"));
        expect(warnEntry).toBeDefined();
        expect(warnEntry[0]).toContain("US-001");
        expect(warnEntry[0]).toContain("wreckit system files");
      });

      it("does not warn for changes within item directory", async () => {
        const prd = createTestPrd();
        const item = createTestItem({ state: "planned" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Initialize git repo for status comparison
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        mockedRunAgent.mockImplementation(async () => {
          // Create file within item directory (allowed)
          await fs.writeFile(path.join(itemDir, "notes.md"), "# Story notes", "utf-8");
          // Update PRD to mark story as done
          const prdPath = path.join(itemDir, "prd.json");
          const currentPrd = JSON.parse(await fs.readFile(prdPath, "utf-8")) as Prd;
          currentPrd.user_stories[0].status = "done";
          await fs.writeFile(prdPath, JSON.stringify(currentPrd, null, 2), "utf-8");
          return {
            success: true,
            output: "test output",
            timedOut: false,
            exitCode: 0,
            completionDetected: true,
          };
        });

        const result = await runPhaseImplement(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(true);
        // Verify no warning for wreckit system files (changes are within item directory)
        const warnCalls = mockLogger.warn.mock.calls;
        const warnEntry = warnCalls.find((call: string[]) => call[0]?.includes("wreckit system files"));
        expect(warnEntry).toBeUndefined();
      });

      it("skips scope tracking in mockAgent mode", async () => {
        const prd = createTestPrd();
        const item = createTestItem({ state: "planned" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Initialize git repo
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        // Mock agent to do nothing (simulating mockAgent mode behavior)
        mockedRunAgent.mockResolvedValue({
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        });

        const result = await runPhaseImplement(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
          mockAgent: true,
        });

        expect(result.success).toBe(true);
        // In mockAgent mode, git status tracking should be skipped (no "changed" logs)
        const infoCalls = mockLogger.info.mock.calls;
        const logEntry = infoCalls.find((call: string[]) => call[0]?.includes("changed") && call[0]?.includes("file"));
        expect(logEntry).toBeUndefined();
      });

      it("skips scope tracking in dryRun mode", async () => {
        const prd = createTestPrd();
        const item = createTestItem({ state: "planned" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Initialize git repo
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir, stdio: "ignore" });

        // Mock agent to do nothing
        mockedRunAgent.mockResolvedValue({
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        });

        const result = await runPhaseImplement(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
          dryRun: true,
        });

        expect(result.success).toBe(true);
        // In dryRun mode, git status tracking should be skipped (no "changed" logs)
        const infoCalls = mockLogger.info.mock.calls;
        const logEntry = infoCalls.find((call: string[]) => call[0]?.includes("changed") && call[0]?.includes("file"));
        expect(logEntry).toBeUndefined();
      });
    });
  });

  describe("runPhasePr", () => {
    it("fails when not all stories done", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("not all stories");
    });

    it("succeeds when all stories done (stubbed)", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("in_pr");
      expect(result.item.pr_url).not.toBeNull();
    });

    describe("preflight/commit ordering bug (Gap 1)", () => {
      it("auto-commits uncommitted changes before preflight check", async () => {
        const prd = createTestPrd({
          user_stories: [
            {
              id: "US-001",
              title: "Done Story",
              acceptance_criteria: [],
              priority: 1,
              status: "done",
              notes: "",
            },
          ],
        });
        const item = createTestItem({ state: "implementing" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Track the call count to simulate behavior changes after commit
        let callCount = 0;
        mockedHasUncommittedChanges.mockImplementation(async () => {
          callCount++;
          // After commit is called, hasUncommittedChanges should return false
          // The first call is before commit (returns true), subsequent calls return false
          return callCount === 1;
        });

        // Preflight passes because it runs AFTER commit now
        mockedCheckGitPreflight.mockReturnValue(Promise.resolve({ valid: true, errors: [] }));

        const result = await runPhasePr(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        // After the fix: should succeed because auto-commit runs before preflight
        expect(result.success).toBe(true);
        expect(result.item.state).toBe("in_pr");

        // Verify that commit was called (auto-commit happened)
        expect(mockedCommitAll).toHaveBeenCalledWith(
          `feat(001-test-feature): implement ${item.title}`,
          expect.any(Object)
        );
      });

      it("skips auto-commit when there are no uncommitted changes", async () => {
        const prd = createTestPrd({
          user_stories: [
            {
              id: "US-001",
              title: "Done Story",
              acceptance_criteria: [],
              priority: 1,
              status: "done",
              notes: "",
            },
          ],
        });
        const item = createTestItem({ state: "implementing" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // No uncommitted changes
        mockedHasUncommittedChanges.mockReturnValue(Promise.resolve(false));

        const result = await runPhasePr(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        expect(result.success).toBe(true);
        expect(result.item.state).toBe("in_pr");

        // Verify that commit was NOT called (no uncommitted changes)
        expect(mockedCommitAll).not.toHaveBeenCalled();
      });

      it("commits changes even when preflight would fail due to uncommitted changes", async () => {
        const prd = createTestPrd({
          user_stories: [
            {
              id: "US-001",
              title: "Done Story",
              acceptance_criteria: [],
              priority: 1,
              status: "done",
              notes: "",
            },
          ],
        });
        const item = createTestItem({ state: "implementing" });
        const itemDir = await setupItem(item);
        await fs.writeFile(
          path.join(itemDir, "prd.json"),
          JSON.stringify(prd, null, 2),
          "utf-8"
        );

        // Simulate uncommitted changes
        mockedHasUncommittedChanges.mockReturnValue(Promise.resolve(true));

        // Preflight should be called AFTER auto-commit, so it should pass
        // (since after commit there are no uncommitted changes)
        mockedCheckGitPreflight.mockReturnValue(Promise.resolve({ valid: true, errors: [] }));

        const result = await runPhasePr(item.id, {
          root: tempDir,
          config,
          logger: mockLogger,
        });

        // Should succeed - commit happened, then preflight passed
        expect(result.success).toBe(true);
        expect(mockedCommitAll).toHaveBeenCalled();
        expect(mockedCheckGitPreflight).toHaveBeenCalled();
      });
    });
  });

  describe("runPhaseComplete", () => {
    it("transitions from in_pr to done (stubbed)", async () => {
      const item = createTestItem({
        state: "in_pr",
        pr_url: "https://github.com/example/repo/pull/1",
        pr_number: 1,
      });
      await setupItem(item);

      const result = await runPhaseComplete(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("done");
    });

    it("fails when not in in_pr state", async () => {
      const item = createTestItem({ state: "implementing" });
      await setupItem(item);

      const result = await runPhaseComplete(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("in_pr");
    });
  });

  describe("getNextPhase", () => {
    it("raw -> 'research'", () => {
      const item = createTestItem({ state: "idea" });
      expect(getNextPhase(item)).toBe("research");
    });

    it("researched -> 'plan'", () => {
      const item = createTestItem({ state: "researched" });
      expect(getNextPhase(item)).toBe("plan");
    });

    it("planned -> 'implement'", () => {
      const item = createTestItem({ state: "planned" });
      expect(getNextPhase(item)).toBe("implement");
    });

    it("implementing -> 'pr'", () => {
      const item = createTestItem({ state: "implementing" });
      expect(getNextPhase(item)).toBe("pr");
    });

    it("in_pr -> 'complete'", () => {
      const item = createTestItem({ state: "in_pr" });
      expect(getNextPhase(item)).toBe("complete");
    });

    it("done -> null", () => {
      const item = createTestItem({ state: "done" });
      expect(getNextPhase(item)).toBeNull();
    });
  });

  describe("runPhasePr - direct mode safeguards (Gap 4)", () => {
    it("fails when direct mode enabled without explicit opt-in", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      // Config with direct mode but WITHOUT allow_unsafe_direct_merge
      const directConfig = { ...config, merge_mode: "direct" as const, pr_checks: { ...config.pr_checks, allow_unsafe_direct_merge: false } };

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config: directConfig,
        logger: mockLogger,
      });

      // Should fail because allow_unsafe_direct_merge is false
      expect(result.success).toBe(false);
      expect(result.error).toContain("allow_unsafe_direct_merge");
      expect(result.error).toContain("explicit opt-in");
    });

    it("succeeds when direct mode enabled with explicit opt-in", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      // Config with direct mode AND allow_unsafe_direct_merge
      const directConfig = { ...config, merge_mode: "direct" as const, pr_checks: { ...config.pr_checks, allow_unsafe_direct_merge: true } };

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config: directConfig,
        logger: mockLogger,
      });

      // Should succeed because allow_unsafe_direct_merge is true
      expect(result.success).toBe(true);
      expect(result.item.state).toBe("done");
      expect(result.item.rollback_sha).toBe("abc123");
    });

    it("logs warning when direct mode is enabled with opt-in", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      // Config with direct mode AND allow_unsafe_direct_merge
      const directConfig = { ...config, merge_mode: "direct" as const, pr_checks: { ...config.pr_checks, allow_unsafe_direct_merge: true } };

      await runPhasePr(item.id, {
        root: tempDir,
        config: directConfig,
        logger: mockLogger,
      });

      // Should log a warning about direct mode risks
      const warnCalls = mockLogger.warn.mock.calls;
      const warnEntry = warnCalls.find((call: string[]) => call[0]?.includes("DIRECT MERGE MODE"));
      expect(warnEntry).toBeDefined();
      expect(warnEntry[0]).toContain("bypasses PR review");
    });

    it("creates rollback anchor before direct merge", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      // Config with direct mode AND allow_unsafe_direct_merge
      const directConfig = { ...config, merge_mode: "direct" as const, pr_checks: { ...config.pr_checks, allow_unsafe_direct_merge: true } };

      await runPhasePr(item.id, {
        root: tempDir,
        config: directConfig,
        logger: mockLogger,
      });

      // Verify that getBranchSha was called to capture rollback anchor
      expect(mockedGetBranchSha).toHaveBeenCalledWith("main", expect.any(Object));

      // Verify rollback SHA is saved to item
      const updatedItem = await readItemState(item.id);
      expect(updatedItem.rollback_sha).toBe("abc123");
    });
  });
});
