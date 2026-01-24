import { describe, it, expect } from "bun:test";
import {
  WreckitError,
  ErrorCodes,
  // Phase errors
  PhaseFailedError,
  PhaseValidationError,
  TransitionError,
  ArtifactNotCreatedError,
  // Quality errors
  ResearchQualityError,
  PlanQualityError,
  StoryQualityError,
  // Git errors
  BranchError,
  PushError,
  PrCreationError,
  MergeConflictError,
  RemoteValidationError,
  // Utilities
  toExitCode,
  isWreckitError,
} from "../errors";

describe("ErrorCodes", () => {
  it("exports all error codes as constants", () => {
    expect(ErrorCodes.PHASE_FAILED).toBe("PHASE_FAILED");
    expect(ErrorCodes.BRANCH_ERROR).toBe("BRANCH_ERROR");
    expect(ErrorCodes.RESEARCH_QUALITY).toBe("RESEARCH_QUALITY");
  });

  it("has consistent code values matching their key names", () => {
    // Codes should match their key names
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(value).toBe(key);
    }
  });

  it("includes all existing codes", () => {
    expect(ErrorCodes.REPO_NOT_FOUND).toBe("REPO_NOT_FOUND");
    expect(ErrorCodes.INVALID_JSON).toBe("INVALID_JSON");
    expect(ErrorCodes.SCHEMA_VALIDATION).toBe("SCHEMA_VALIDATION");
    expect(ErrorCodes.FILE_NOT_FOUND).toBe("FILE_NOT_FOUND");
    expect(ErrorCodes.CONFIG_ERROR).toBe("CONFIG_ERROR");
    expect(ErrorCodes.AGENT_ERROR).toBe("AGENT_ERROR");
    expect(ErrorCodes.GIT_ERROR).toBe("GIT_ERROR");
    expect(ErrorCodes.TIMEOUT).toBe("TIMEOUT");
    expect(ErrorCodes.INTERRUPTED).toBe("INTERRUPTED");
  });

  it("includes all phase error codes", () => {
    expect(ErrorCodes.PHASE_FAILED).toBe("PHASE_FAILED");
    expect(ErrorCodes.PHASE_VALIDATION).toBe("PHASE_VALIDATION");
    expect(ErrorCodes.INVALID_TRANSITION).toBe("INVALID_TRANSITION");
    expect(ErrorCodes.INVALID_STATE).toBe("INVALID_STATE");
    expect(ErrorCodes.ARTIFACT_NOT_CREATED).toBe("ARTIFACT_NOT_CREATED");
  });

  it("includes all quality validation error codes", () => {
    expect(ErrorCodes.RESEARCH_QUALITY).toBe("RESEARCH_QUALITY");
    expect(ErrorCodes.PLAN_QUALITY).toBe("PLAN_QUALITY");
    expect(ErrorCodes.STORY_QUALITY).toBe("STORY_QUALITY");
  });

  it("includes all git operation error codes", () => {
    expect(ErrorCodes.BRANCH_ERROR).toBe("BRANCH_ERROR");
    expect(ErrorCodes.PUSH_ERROR).toBe("PUSH_ERROR");
    expect(ErrorCodes.PR_CREATION_ERROR).toBe("PR_CREATION_ERROR");
    expect(ErrorCodes.MERGE_CONFLICT).toBe("MERGE_CONFLICT");
    expect(ErrorCodes.REMOTE_VALIDATION).toBe("REMOTE_VALIDATION");
  });
});

describe("Phase Errors", () => {
  describe("PhaseFailedError", () => {
    it("creates error with phase and itemId", () => {
      const error = new PhaseFailedError("research", "item-123", "Agent timed out");
      expect(error.phase).toBe("research");
      expect(error.itemId).toBe("item-123");
      expect(error.message).toBe("Agent timed out");
      expect(error.code).toBe(ErrorCodes.PHASE_FAILED);
      expect(error.name).toBe("PhaseFailedError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PhaseFailedError("plan", "item-456", "Failed");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("PhaseValidationError", () => {
    it("creates error with phase", () => {
      const error = new PhaseValidationError("implement", "Not all stories done");
      expect(error.phase).toBe("implement");
      expect(error.message).toBe("Not all stories done");
      expect(error.code).toBe(ErrorCodes.PHASE_VALIDATION);
      expect(error.name).toBe("PhaseValidationError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PhaseValidationError("research", "Missing prereqs");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("TransitionError", () => {
    it("creates error with state transition info", () => {
      const error = new TransitionError("idea", "implementing", "Cannot skip states");
      expect(error.fromState).toBe("idea");
      expect(error.toState).toBe("implementing");
      expect(error.message).toBe("Cannot skip states");
      expect(error.code).toBe(ErrorCodes.INVALID_TRANSITION);
      expect(error.name).toBe("TransitionError");
    });

    it("is instanceof WreckitError", () => {
      const error = new TransitionError("done", "idea", "Cannot revert");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("ArtifactNotCreatedError", () => {
    it("creates error with artifact path and phase", () => {
      const error = new ArtifactNotCreatedError("research.md", "research");
      expect(error.artifactPath).toBe("research.md");
      expect(error.phase).toBe("research");
      expect(error.message).toContain("research.md");
      expect(error.message).toContain("research phase");
      expect(error.code).toBe(ErrorCodes.ARTIFACT_NOT_CREATED);
      expect(error.name).toBe("ArtifactNotCreatedError");
    });

    it("is instanceof WreckitError", () => {
      const error = new ArtifactNotCreatedError("plan.md", "plan");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });
});

describe("Quality Errors", () => {
  describe("ResearchQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Missing Summary section", "Too few citations"];
      const error = new ResearchQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.message).toContain("Missing Summary section");
      expect(error.message).toContain("Too few citations");
      expect(error.code).toBe(ErrorCodes.RESEARCH_QUALITY);
      expect(error.name).toBe("ResearchQualityError");
    });

    it("handles empty errors array", () => {
      const error = new ResearchQualityError([]);
      expect(error.errors).toEqual([]);
      expect(error.message).toContain("Research quality validation failed");
    });

    it("is instanceof WreckitError", () => {
      const error = new ResearchQualityError(["error"]);
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("PlanQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Missing phases"];
      const error = new PlanQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.message).toContain("Missing phases");
      expect(error.code).toBe(ErrorCodes.PLAN_QUALITY);
      expect(error.name).toBe("PlanQualityError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PlanQualityError(["error"]);
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("StoryQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Story US-001 has no acceptance criteria"];
      const error = new StoryQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.message).toContain("Story US-001 has no acceptance criteria");
      expect(error.code).toBe(ErrorCodes.STORY_QUALITY);
      expect(error.name).toBe("StoryQualityError");
    });

    it("handles multiple errors", () => {
      const errors = ["Error 1", "Error 2", "Error 3"];
      const error = new StoryQualityError(errors);
      expect(error.errors).toHaveLength(3);
      for (const e of errors) {
        expect(error.message).toContain(e);
      }
    });

    it("is instanceof WreckitError", () => {
      const error = new StoryQualityError(["error"]);
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });
});

describe("Git Errors", () => {
  describe("BranchError", () => {
    it("creates error for create operation", () => {
      const error = new BranchError("feature-123", "create", "Branch exists");
      expect(error.branchName).toBe("feature-123");
      expect(error.operation).toBe("create");
      expect(error.message).toBe("Branch exists");
      expect(error.code).toBe(ErrorCodes.BRANCH_ERROR);
      expect(error.name).toBe("BranchError");
    });

    it("creates error for checkout operation", () => {
      const error = new BranchError("main", "checkout", "Checkout failed");
      expect(error.branchName).toBe("main");
      expect(error.operation).toBe("checkout");
      expect(error.message).toBe("Checkout failed");
    });

    it("creates error for delete operation", () => {
      const error = new BranchError("old-branch", "delete", "Cannot delete");
      expect(error.branchName).toBe("old-branch");
      expect(error.operation).toBe("delete");
      expect(error.message).toBe("Cannot delete");
    });

    it("is instanceof WreckitError", () => {
      const error = new BranchError("test", "create", "msg");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("PushError", () => {
    it("creates error with branch and remote", () => {
      const error = new PushError("feature-123", "origin", "Permission denied");
      expect(error.branchName).toBe("feature-123");
      expect(error.remote).toBe("origin");
      expect(error.message).toBe("Permission denied");
      expect(error.code).toBe(ErrorCodes.PUSH_ERROR);
      expect(error.name).toBe("PushError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PushError("test", "origin", "msg");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("PrCreationError", () => {
    it("creates error with head and base branches", () => {
      const error = new PrCreationError("feature-123", "main", "No commits");
      expect(error.headBranch).toBe("feature-123");
      expect(error.baseBranch).toBe("main");
      expect(error.message).toBe("No commits");
      expect(error.code).toBe(ErrorCodes.PR_CREATION_ERROR);
      expect(error.name).toBe("PrCreationError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PrCreationError("head", "base", "msg");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("MergeConflictError", () => {
    it("creates error with source and target branches", () => {
      const error = new MergeConflictError("feature-123", "main");
      expect(error.sourceBranch).toBe("feature-123");
      expect(error.targetBranch).toBe("main");
      expect(error.message).toContain("cannot be cleanly merged");
      expect(error.message).toContain("feature-123");
      expect(error.message).toContain("main");
      expect(error.code).toBe(ErrorCodes.MERGE_CONFLICT);
      expect(error.name).toBe("MergeConflictError");
    });

    it("is instanceof WreckitError", () => {
      const error = new MergeConflictError("source", "target");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("RemoteValidationError", () => {
    it("creates error with remote info", () => {
      const error = new RemoteValidationError(
        "origin",
        "git@github.com:other/repo.git",
        ["github.com/myorg/"]
      );
      expect(error.remoteName).toBe("origin");
      expect(error.actualUrl).toBe("git@github.com:other/repo.git");
      expect(error.allowedPatterns).toEqual(["github.com/myorg/"]);
      expect(error.message).toContain("git@github.com:other/repo.git");
      expect(error.message).toContain("github.com/myorg/");
      expect(error.code).toBe(ErrorCodes.REMOTE_VALIDATION);
      expect(error.name).toBe("RemoteValidationError");
    });

    it("handles null actualUrl", () => {
      const error = new RemoteValidationError("origin", null, ["pattern"]);
      expect(error.actualUrl).toBeNull();
      expect(error.message).toContain("null");
    });

    it("handles multiple allowed patterns", () => {
      const patterns = ["github.com/org1/", "github.com/org2/"];
      const error = new RemoteValidationError("origin", "url", patterns);
      expect(error.allowedPatterns).toHaveLength(2);
      for (const p of patterns) {
        expect(error.message).toContain(p);
      }
    });

    it("is instanceof WreckitError", () => {
      const error = new RemoteValidationError("origin", "url", []);
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });
});

describe("Error Exit Codes", () => {
  it("all new phase errors return exit code 1", () => {
    expect(toExitCode(new PhaseFailedError("test", "id", "msg"))).toBe(1);
    expect(toExitCode(new PhaseValidationError("test", "msg"))).toBe(1);
    expect(toExitCode(new TransitionError("a", "b", "msg"))).toBe(1);
    expect(toExitCode(new ArtifactNotCreatedError("file", "phase"))).toBe(1);
  });

  it("all new quality errors return exit code 1", () => {
    expect(toExitCode(new ResearchQualityError(["err"]))).toBe(1);
    expect(toExitCode(new PlanQualityError(["err"]))).toBe(1);
    expect(toExitCode(new StoryQualityError(["err"]))).toBe(1);
  });

  it("all new git errors return exit code 1", () => {
    expect(toExitCode(new BranchError("br", "create", "msg"))).toBe(1);
    expect(toExitCode(new PushError("br", "remote", "msg"))).toBe(1);
    expect(toExitCode(new PrCreationError("head", "base", "msg"))).toBe(1);
    expect(toExitCode(new MergeConflictError("a", "b"))).toBe(1);
    expect(toExitCode(new RemoteValidationError("origin", "url", []))).toBe(1);
  });
});

describe("isWreckitError", () => {
  it("returns true for all new error types", () => {
    // Phase errors
    expect(isWreckitError(new PhaseFailedError("p", "i", "m"))).toBe(true);
    expect(isWreckitError(new PhaseValidationError("p", "m"))).toBe(true);
    expect(isWreckitError(new TransitionError("a", "b", "m"))).toBe(true);
    expect(isWreckitError(new ArtifactNotCreatedError("f", "p"))).toBe(true);

    // Quality errors
    expect(isWreckitError(new ResearchQualityError([]))).toBe(true);
    expect(isWreckitError(new PlanQualityError([]))).toBe(true);
    expect(isWreckitError(new StoryQualityError([]))).toBe(true);

    // Git errors
    expect(isWreckitError(new BranchError("b", "create", "m"))).toBe(true);
    expect(isWreckitError(new PushError("b", "r", "m"))).toBe(true);
    expect(isWreckitError(new PrCreationError("h", "b", "m"))).toBe(true);
    expect(isWreckitError(new MergeConflictError("s", "t"))).toBe(true);
    expect(isWreckitError(new RemoteValidationError("o", null, []))).toBe(true);
  });

  it("returns false for regular Error", () => {
    expect(isWreckitError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isWreckitError("string")).toBe(false);
    expect(isWreckitError(null)).toBe(false);
    expect(isWreckitError(undefined)).toBe(false);
    expect(isWreckitError({})).toBe(false);
    expect(isWreckitError(123)).toBe(false);
  });
});
