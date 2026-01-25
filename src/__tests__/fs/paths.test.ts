import { describe, expect, it } from "bun:test";
import { getMediaDir, getMediaOutputPath } from "../../fs/paths";

describe("Path Utilities - Media", () => {
  describe("getMediaDir", () => {
    it("returns correct path for various root paths", () => {
      expect(getMediaDir("/Users/test/project")).toBe("/Users/test/project/.wreckit/media");
      expect(getMediaDir("/home/user/repos/wreckit")).toBe("/home/user/repos/wreckit/.wreckit/media");
      expect(getMediaDir("/tmp/test-repo")).toBe("/tmp/test-repo/.wreckit/media");
    });
  });

  describe("getMediaOutputPath", () => {
    it("generates correct filename format for simple item IDs", () => {
      expect(getMediaOutputPath("/Users/test/project", "001-init"))
        .toBe("/Users/test/project/.wreckit/media/001-init-summary.mp4");
      expect(getMediaOutputPath("/Users/test/project", "036-create-wreckit-summarize"))
        .toBe("/Users/test/project/.wreckit/media/036-create-wreckit-summarize-summary.mp4");
    });

    it("sanitizes item IDs by replacing '/' with '-'", () => {
      // Item IDs with slashes should be sanitized
      expect(getMediaOutputPath("/Users/test/project", "036/feature-name"))
        .toBe("/Users/test/project/.wreckit/media/036-feature-name-summary.mp4");
      expect(getMediaOutputPath("/Users/test/project", "001/002/nested"))
        .toBe("/Users/test/project/.wreckit/media/001-002-nested-summary.mp4");
    });

    it("handles special characters in IDs", () => {
      // Underscores and hyphens should be preserved
      expect(getMediaOutputPath("/Users/test/project", "001_test-case"))
        .toBe("/Users/test/project/.wreckit/media/001_test-case-summary.mp4");
      expect(getMediaOutputPath("/Users/test/project", "036-test-case-name"))
        .toBe("/Users/test/project/.wreckit/media/036-test-case-name-summary.mp4");
    });

    it("handles edge cases", () => {
      // Empty-ish IDs (shouldn't happen in practice but test defensive coding)
      expect(getMediaOutputPath("/Users/test/project", "001"))
        .toBe("/Users/test/project/.wreckit/media/001-summary.mp4");
    });
  });
});
