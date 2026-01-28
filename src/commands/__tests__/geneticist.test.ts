import { describe, it, expect, mock, beforeEach } from "bun:test";
import * as fs from "node:fs/promises";
import { geneticistCommand, type GeneticistOptions } from "../geneticist";
import { loadConfig } from "../../config";
import { runAgentUnion } from "../../agent/runner";
import { loadPromptTemplate } from "../../prompts";
import { createOrUpdatePr } from "../../git/pr";
import { ensureBranch, commitAll, pushBranch } from "../../git/branch";

// Mocks
mock.module("node:fs/promises", () => ({
  readFile: mock(),
  writeFile: mock(),
  mkdir: mock(),
  access: mock(),
}));

mock.module("../../config", () => ({
  loadConfig: mock(),
}));

mock.module("../../agent/runner", () => ({
  runAgentUnion: mock(),
  getAgentConfigUnion: mock(),
}));

mock.module("../../prompts", () => ({
  loadPromptTemplate: mock(),
}));

mock.module("../../git/pr", () => ({
  createOrUpdatePr: mock(),
}));

mock.module("../../git/branch", () => ({
  ensureBranch: mock(),
  commitAll: mock(),
  pushBranch: mock(),
}));

mock.module("../../fs/paths", () => ({
  getWreckitDir: mock(() => "/mock/wreckit"),
  getPromptsDir: mock(() => "/mock/wreckit/prompts"),
}));

describe("geneticistCommand", () => {
  const mockLogger = {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  } as any;

  const mockOptions: GeneticistOptions = {
    dryRun: false,
    autoMerge: false,
    cwd: "/mock/cwd",
    verbose: true,
    timeWindowHours: 48,
    minErrorCount: 2,
  };

  const mockHealingLog = `
    {"timestamp":"2026-01-28T10:00:00.000Z","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}
    {"timestamp":"2026-01-28T10:05:00.000Z","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}
    {"timestamp":"2026-01-28T10:10:00.000Z","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}
  `.trim();

  beforeEach(() => {
    (loadConfig as any).mockResolvedValue({
      base_branch: "main",
      branch_prefix: "wreckit/",
    });
    (fs.readFile as any).mockResolvedValue(mockHealingLog);
    (loadPromptTemplate as any).mockResolvedValue("# Plan {{id}} {{title}}");
    (runAgentUnion as any).mockResolvedValue({
      success: true,
      output: "# Plan {{id}} {{title}} (Optimized for git lock)",
    });
    (ensureBranch as any).mockResolvedValue({ branchName: "wreckit/geneticist-test", created: true });
    (createOrUpdatePr as any).mockResolvedValue({ url: "https://github.com/pr/1", number: 1, created: true });
  });

  it("should analyze healing logs and trigger optimization for recurrent patterns", async () => {
    await geneticistCommand(mockOptions, mockLogger);

    expect(fs.readFile).toHaveBeenCalled();
    expect(loadPromptTemplate).toHaveBeenCalled();
    expect(runAgentUnion).toHaveBeenCalled();
    expect(ensureBranch).toHaveBeenCalled();
    expect(commitAll).toHaveBeenCalled();
    expect(pushBranch).toHaveBeenCalled();
    expect(createOrUpdatePr).toHaveBeenCalled();
  });

  it("should respect dry-run mode", async () => {
    // Reset mocks
    (runAgentUnion as any).mockClear();
    (createOrUpdatePr as any).mockClear();

    await geneticistCommand({ ...mockOptions, dryRun: true }, mockLogger);

    expect(fs.readFile).toHaveBeenCalled();
    expect(runAgentUnion).not.toHaveBeenCalled();
    expect(createOrUpdatePr).not.toHaveBeenCalled();
  });

  it("should skip optimization if validation fails", async () => {
    (runAgentUnion as any).mockResolvedValue({
      success: true,
      output: "# Plan (Broken)", // Missing variables
    });
    
    // Reset pr mock
    (createOrUpdatePr as any).mockClear();

    await geneticistCommand(mockOptions, mockLogger);

    expect(runAgentUnion).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(createOrUpdatePr).not.toHaveBeenCalled();
  });
});