import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { GeneticistOptions } from "../geneticist";

// Create mock functions first
const mockReadFile = mock(() => Promise.resolve(""));
const mockWriteFile = mock(() => Promise.resolve());
const mockMkdir = mock(() => Promise.resolve());
const mockAccess = mock(() => Promise.resolve());
const mockLoadConfig = mock(() => Promise.resolve({}));
const mockRunAgentUnion = mock(() => Promise.resolve({ success: true, output: "" }));
const mockGetAgentConfigUnion = mock(() => ({}));
const mockLoadPromptTemplate = mock(() => Promise.resolve(""));
const mockCreateOrUpdatePr = mock(() => Promise.resolve({ url: "", number: 1, created: true }));
const mockEnsureBranch = mock(() => Promise.resolve({ branchName: "", created: true }));
const mockCommitAll = mock(() => Promise.resolve());
const mockPushBranch = mock(() => Promise.resolve());

// Set up mocks before importing the module
mock.module("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  access: mockAccess,
}));

mock.module("../../config", () => ({
  loadConfig: mockLoadConfig,
}));

mock.module("../../agent/runner", () => ({
  runAgentUnion: mockRunAgentUnion,
  getAgentConfigUnion: mockGetAgentConfigUnion,
}));

mock.module("../../prompts", () => ({
  loadPromptTemplate: mockLoadPromptTemplate,
}));

mock.module("../../git/pr", () => ({
  createOrUpdatePr: mockCreateOrUpdatePr,
}));

mock.module("../../git/branch", () => ({
  ensureBranch: mockEnsureBranch,
  commitAll: mockCommitAll,
  pushBranch: mockPushBranch,
}));

mock.module("../../fs/paths", () => ({
  getWreckitDir: () => "/mock/wreckit",
  getPromptsDir: () => "/mock/wreckit/prompts",
}));

// Now import the module under test
const { geneticistCommand } = await import("../geneticist");

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

  // Use recent timestamps within the 48-hour window
  const now = new Date();
  const recentTimestamp1 = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
  const recentTimestamp2 = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  const recentTimestamp3 = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
  
  const mockHealingLog = `{"timestamp":"${recentTimestamp1}","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}
{"timestamp":"${recentTimestamp2}","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}
{"timestamp":"${recentTimestamp3}","initialError":{"errorType":"git_lock","detectedPattern":"index.lock exists"},"attempts":[],"finalOutcome":"success"}`;

  beforeEach(() => {
    // Reset all mocks
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockLoadConfig.mockReset();
    mockRunAgentUnion.mockReset();
    mockLoadPromptTemplate.mockReset();
    mockEnsureBranch.mockReset();
    mockCommitAll.mockReset();
    mockPushBranch.mockReset();
    mockCreateOrUpdatePr.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();

    // Set up default mock implementations
    mockLoadConfig.mockResolvedValue({
      base_branch: "main",
      branch_prefix: "wreckit/",
    });
    mockReadFile.mockResolvedValue(mockHealingLog);
    mockLoadPromptTemplate.mockResolvedValue("# Plan {{id}} {{title}}");
    mockRunAgentUnion.mockResolvedValue({
      success: true,
      output: "# Plan {{id}} {{title}} (Optimized for git lock)",
    });
    mockEnsureBranch.mockResolvedValue({ branchName: "wreckit/geneticist-test", created: true });
    mockCreateOrUpdatePr.mockResolvedValue({ url: "https://github.com/pr/1", number: 1, created: true });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockCommitAll.mockResolvedValue(undefined);
    mockPushBranch.mockResolvedValue(undefined);
  });

  it("should analyze healing logs and trigger optimization for recurrent patterns", async () => {
    await geneticistCommand(mockOptions, mockLogger);

    expect(mockReadFile).toHaveBeenCalled();
    expect(mockLoadPromptTemplate).toHaveBeenCalled();
    expect(mockRunAgentUnion).toHaveBeenCalled();
    expect(mockEnsureBranch).toHaveBeenCalled();
    expect(mockCommitAll).toHaveBeenCalled();
    expect(mockPushBranch).toHaveBeenCalled();
    expect(mockCreateOrUpdatePr).toHaveBeenCalled();
  });

  it("should respect dry-run mode", async () => {
    await geneticistCommand({ ...mockOptions, dryRun: true }, mockLogger);

    expect(mockReadFile).toHaveBeenCalled();
    expect(mockRunAgentUnion).not.toHaveBeenCalled();
    expect(mockCreateOrUpdatePr).not.toHaveBeenCalled();
  });

  it("should skip optimization if validation fails", async () => {
    mockRunAgentUnion.mockResolvedValue({
      success: true,
      output: "# Plan (Broken)", // Missing variables
    });

    await geneticistCommand(mockOptions, mockLogger);

    expect(mockRunAgentUnion).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockCreateOrUpdatePr).not.toHaveBeenCalled();
  });
});
