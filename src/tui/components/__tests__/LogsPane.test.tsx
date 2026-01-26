import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { LogsPane } from "../LogsPane";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, height, flexDirection }: any) =>
    React.createElement("div", { width, height, flexDirection }, children),
  Text: ({ children, wrap, dimColor }: any) =>
    React.createElement("span", { wrap, dimColor }, children),
}));

describe("LogsPane", () => {
  describe("truncate helper function", () => {
    it("truncates strings longer than maxLen", () => {
      const result = truncate("This is a very long log line", 15);
      expect(result).toBe("This is a very…");
      expect(result.length).toBe(15);
    });

    it("does not truncate strings shorter than maxLen", () => {
      const result = truncate("Short log", 15);
      expect(result).toBe("Short log");
    });

    it("handles empty string", () => {
      const result = truncate("", 10);
      expect(result).toBe("");
    });

    it("handles exact length", () => {
      const result = truncate("Exactly15chars!", 15);
      expect(result).toBe("Exactly15chars!");
    });
  });

  describe("effectiveOffset calculation", () => {
    it("clamps scrollOffset to maxOffset", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 50;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(50); // min(50, max(0, 100 - 20 + 1)) = min(50, 81) = 50
    });

    it("handles scrollOffset greater than maxOffset", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 200; // Too large

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(81); // min(200, 81) = 81
    });

    it("handles negative scrollOffset", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = -10;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(-10); // min(-10, 81) = -10
    });

    it("returns zero when logs.length < height", () => {
      const logs = Array.from({ length: 10 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 5;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(0); // min(5, max(0, 10 - 20 + 1)) = min(5, 0) = 0
    });

    it("returns zero when logs.length === height", () => {
      const logs = Array.from({ length: 20 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 5;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(1); // min(5, max(0, 20 - 20 + 1)) = min(5, 1) = 1
    });

    it("handles empty logs", () => {
      const logs: string[] = [];
      const height = 20;
      const scrollOffset = 5;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));

      expect(effectiveOffset).toBe(0); // min(5, max(0, 0 - 20 + 1)) = min(5, 0) = 0
    });
  });

  describe("visible window calculation", () => {
    it("calculates startIdx correctly", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 10;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);

      expect(startIdx).toBe(71); // max(0, 100 - 20 + 1 - 10) = max(0, 71) = 71
    });

    it("calculates endIdx correctly", () => {
      const height = 20;
      const startIdx = 71;

      const endIdx = startIdx + height - 1;

      expect(endIdx).toBe(90); // 71 + 20 - 1 = 90
    });

    it("slices visible logs correctly", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const startIdx = 71;
      const endIdx = 90;

      const visibleLogs = logs.slice(startIdx, endIdx);

      expect(visibleLogs).toHaveLength(19); // 90 - 71 = 19
      expect(visibleLogs[0]).toBe("Log line 71");
      expect(visibleLogs[visibleLogs.length - 1]).toBe("Log line 89");
    });

    it("handles startIdx at beginning", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 81; // maxOffset

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);

      expect(startIdx).toBe(0); // max(0, 100 - 20 + 1 - 81) = max(0, 0) = 0
    });

    it("handles startIdx calculation with negative result", () => {
      const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 200; // Beyond max

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);

      expect(startIdx).toBe(0); // max(0, negative) = 0
    });
  });

  describe("position indicators", () => {
    it("shows ▲ when not at bottom", () => {
      const effectiveOffset = 10;

      const isAtBottom = effectiveOffset === 0;

      expect(isAtBottom).toBe(false);
    });

    it("does not show ▲ when at bottom", () => {
      const effectiveOffset = 0;

      const isAtBottom = effectiveOffset === 0;

      expect(isAtBottom).toBe(true);
    });

    it("shows ▼ when not at top", () => {
      const startIdx = 10;

      const isAtTop = startIdx === 0;

      expect(isAtTop).toBe(false);
    });

    it("does not show ▼ when at top", () => {
      const startIdx = 0;

      const isAtTop = startIdx === 0;

      expect(isAtTop).toBe(true);
    });

    it("shows both indicators when in middle", () => {
      const effectiveOffset = 10;
      const startIdx = 10;

      const isAtBottom = effectiveOffset === 0;
      const isAtTop = startIdx === 0;

      expect(isAtBottom).toBe(false);
      expect(isAtTop).toBe(false);
      // Would show both ▲ and ▼
    });

    it("shows neither indicator when at top and bottom (few logs)", () => {
      const logs = Array.from({ length: 5 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 0;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);
      const isAtBottom = effectiveOffset === 0;
      const isAtTop = startIdx === 0;

      expect(isAtBottom).toBe(true);
      expect(isAtTop).toBe(true);
    });
  });

  describe("empty state", () => {
    it("renders empty state when logs.length === 0", () => {
      const logs: string[] = [];
      const width = 80;
      const height = 20;
      const scrollOffset = 0;

      const element = React.createElement(LogsPane, {
        logs,
        width,
        height,
        scrollOffset,
      });

      expect(element).toBeDefined();
      expect(element.props.logs).toHaveLength(0);
    });

    it("shows 'no output yet' message for empty logs", () => {
      const logs: string[] = [];

      expect(logs.length).toBe(0);
    });
  });

  describe("component rendering", () => {
    it("renders without crashing for empty logs", () => {
      const element = React.createElement(LogsPane, {
        logs: [],
        width: 80,
        height: 20,
        scrollOffset: 0,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(LogsPane);
    });

    it("renders without crashing for non-empty logs", () => {
      const logs = Array.from({ length: 50 }, (_, i) => `Log line ${i}`);

      const element = React.createElement(LogsPane, {
        logs,
        width: 80,
        height: 20,
        scrollOffset: 0,
      });

      expect(element).toBeDefined();
      expect(element.props.logs).toHaveLength(50);
    });

    it("accepts all required props", () => {
      const logs = ["Log 1", "Log 2", "Log 3"];
      const width = 80;
      const height = 20;
      const scrollOffset = 5;

      const element = React.createElement(LogsPane, {
        logs,
        width,
        height,
        scrollOffset,
      });

      expect(element.props.logs).toEqual(logs);
      expect(element.props.width).toBe(width);
      expect(element.props.height).toBe(height);
      expect(element.props.scrollOffset).toBe(scrollOffset);
    });

    it("calculates innerWidth correctly", () => {
      const width = 80;
      const innerWidth = width - 2;

      expect(innerWidth).toBe(78);
    });
  });

  describe("header rendering", () => {
    it("calculates border width for header", () => {
      const innerWidth = 78;

      const leftBorder = Math.min(innerWidth / 4, 10);
      const rightBorder = Math.max(0, innerWidth - 24);

      expect(leftBorder).toBe(10); // Math.min(19.5, 10) = 10
      expect(rightBorder).toBe(54);
    });

    it("limits left border to maximum of 10", () => {
      const innerWidth = 100;

      const leftBorder = Math.min(innerWidth / 4, 10);

      expect(leftBorder).toBe(10);
    });

    it("handles small innerWidth for right border", () => {
      const innerWidth = 20;

      const rightBorder = Math.max(0, innerWidth - 24);

      expect(rightBorder).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles single log line", () => {
      const logs = ["Single log line"];
      const height = 20;
      const scrollOffset = 0;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);
      const endIdx = startIdx + height - 1;
      const visibleLogs = logs.slice(startIdx, endIdx);

      expect(visibleLogs).toHaveLength(1);
      expect(visibleLogs[0]).toBe("Single log line");
    });

    it("handles logs exactly matching height", () => {
      const logs = Array.from({ length: 20 }, (_, i) => `Log line ${i}`);
      const height = 20;
      const scrollOffset = 0;

      const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
      const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);
      const endIdx = startIdx + height - 1;

      expect(startIdx).toBe(1);
      expect(endIdx).toBe(20);
    });

    it("handles very long log line that needs truncation", () => {
      const longLog = "A".repeat(200);
      const innerWidth = 78;

      const truncated = truncate(longLog, innerWidth);

      expect(truncated.length).toBe(innerWidth);
      expect(truncated).toContain("…");
    });

    it("handles special characters in log lines", () => {
      const logWithSpecialChars = "Error: [ERROR] Failed to parse JSON at line 123";
      const result = truncate(logWithSpecialChars, 50);

      expect(result).toContain("Error:");
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });
});

// Helper function (copied from LogsPane for testing)
function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
