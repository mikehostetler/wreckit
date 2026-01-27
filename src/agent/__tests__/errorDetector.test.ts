/**
 * Unit tests for Error Detection Engine
 */

import { describe, it, expect } from "bun:test";
import { detectRecoverableError, type ErrorDiagnosis } from "../errorDetector";
import type { AgentResult } from "../runner";

describe("Error Detection Engine", () => {
  describe("detectRecoverableError", () => {
    it("should return null for successful agent execution", () => {
      const result: AgentResult = {
        success: true,
        output: "All good!",
        timedOut: false,
        exitCode: 0,
        completionDetected: true,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).toBeNull();
    });

    it("should detect git lock errors with .git/index.lock", () => {
      const result: AgentResult = {
        success: false,
        output: "error: unable to create '.git/index.lock': File exists",
        timedOut: false,
        exitCode: 128,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("git_lock");
      expect(diagnosis?.confidence).toBeGreaterThan(0.8);
    });

    it("should detect git lock errors with 'another git process'", () => {
      const result: AgentResult = {
        success: false,
        output:
          "fatal: Unable to create '.git/index.lock': Another git process is running",
        timedOut: false,
        exitCode: 128,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("git_lock");
      expect(diagnosis?.confidence).toBeGreaterThan(0.8);
    });

    it("should detect npm failure errors with npm ERR!", () => {
      const result: AgentResult = {
        success: false,
        output:
          "npm ERR! code ENOENT\nnpm ERR! syscall open\nnpm ERR! path /app/node_modules/missing-module",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("npm_failure");
      expect(diagnosis?.confidence).toBeGreaterThan(0.7);
    });

    it("should detect npm failure errors with missing module", () => {
      const result: AgentResult = {
        success: false,
        output: "Error: Cannot find module 'some-package'",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("npm_failure");
    });

    it("should detect JSON corruption errors with unexpected token", () => {
      const result: AgentResult = {
        success: false,
        output:
          "SyntaxError: Unexpected token } in JSON at position 42 while parsing config.json",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("json_corruption");
      expect(diagnosis?.confidence).toBeGreaterThan(0.7);
    });

    it("should detect JSON corruption errors with JSON.parse error", () => {
      const result: AgentResult = {
        success: false,
        output: "JSON.parse error while reading index.json",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.recoverable).toBe(true);
      expect(diagnosis?.errorType).toBe("json_corruption");
    });

    it("should return null for non-recoverable errors", () => {
      const result: AgentResult = {
        success: false,
        output: "TypeError: Cannot read property 'x' of undefined",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).toBeNull();
    });

    it("should handle empty output gracefully", () => {
      const result: AgentResult = {
        success: false,
        output: "",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).toBeNull();
    });

    it("should be case-insensitive for error patterns", () => {
      const result: AgentResult = {
        success: false,
        output: "ERROR: UNABLE TO CREATE '.GIT/INDEX.LOCK': FILE EXISTS",
        timedOut: false,
        exitCode: 128,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      expect(diagnosis?.errorType).toBe("git_lock");
    });

    it("should handle mixed error types (prioritize git lock)", () => {
      const result: AgentResult = {
        success: false,
        output:
          "npm ERR! code ELOCK\nUnable to create '.git/index.lock': File exists",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis).not.toBeNull();
      // Git lock is checked first and should be detected
      expect(diagnosis?.errorType).toBe("git_lock");
    });

    it("should include suggested repair in diagnosis", () => {
      const result: AgentResult = {
        success: false,
        output: "error: unable to create '.git/index.lock': File exists",
        timedOut: false,
        exitCode: 128,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis?.suggestedRepair).toContain("remove_git_lock");
    });

    it("should include detected pattern in diagnosis", () => {
      const result: AgentResult = {
        success: false,
        output: "npm ERR! code ENOENT\nCannot find module 'missing-package'",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };

      const diagnosis = detectRecoverableError(result);
      expect(diagnosis?.detectedPattern).toBeDefined();
      expect(diagnosis?.detectedPattern.length).toBeGreaterThan(0);
    });
  });
});
