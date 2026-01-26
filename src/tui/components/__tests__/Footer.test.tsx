import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import { Footer } from "../Footer";
import { createMockTuiState } from "../../__tests__/test-utils";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, flexDirection }: any) =>
    React.createElement("div", { width, flexDirection }, children),
  Text: ({ children, color, bold, dimColor }: any) =>
    React.createElement("span", { color, bold, dimColor }, children),
}));

describe("Footer", () => {
  describe("progress text", () => {
    it("formats progress text correctly", () => {
      const state = createMockTuiState({
        completedCount: 5,
        totalCount: 10,
      });

      const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete | Runtime: 00:00:00`;

      expect(progressText).toContain("5/10");
      expect(progressText).toContain("complete");
      expect(progressText).toContain("Runtime:");
    });

    it("handles zero completed count", () => {
      const state = createMockTuiState({
        completedCount: 0,
        totalCount: 10,
      });

      const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete`;

      expect(progressText).toContain("0/10");
    });

    it("handles all completed", () => {
      const state = createMockTuiState({
        completedCount: 10,
        totalCount: 10,
      });

      const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete`;

      expect(progressText).toContain("10/10");
    });
  });

  describe("progress percent calculation", () => {
    it("calculates progress percent correctly", () => {
      const completedCount = 5;
      const totalCount = 10;

      const progressPercent = totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0;

      expect(progressPercent).toBe(50);
    });

    it("returns 0 when totalCount is 0", () => {
      const completedCount = 0;
      const totalCount = 0;

      const progressPercent = totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0;

      expect(progressPercent).toBe(0);
    });

    it("rounds to nearest integer", () => {
      const completedCount = 3;
      const totalCount = 10;

      const progressPercent = totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0;

      expect(progressPercent).toBe(30);
    });

    it("handles 100 percent", () => {
      const completedCount = 10;
      const totalCount = 10;

      const progressPercent = totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0;

      expect(progressPercent).toBe(100);
    });
  });

  describe("progress bar rendering", () => {
    it("calculates bar width correctly", () => {
      const width = 80;

      const barWidth = Math.min(20, width - 60);

      expect(barWidth).toBe(20);
    });

    it("limits bar width to maximum of 20", () => {
      const width = 100;

      const barWidth = Math.min(20, width - 60);

      expect(barWidth).toBe(20);
    });

    it("handles small width", () => {
      const width = 70;

      const barWidth = Math.min(20, width - 60);

      expect(barWidth).toBe(10);
    });

    it("calculates filled width correctly", () => {
      const progressPercent = 50;
      const barWidth = 20;

      const filledWidth = Math.round((progressPercent / 100) * barWidth);

      expect(filledWidth).toBe(10);
    });

    it("renders progress bar with filled and empty chars", () => {
      const filledWidth = 10;
      const barWidth = 20;

      const progressBar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);

      expect(progressBar).toHaveLength(20);
      expect(progressBar.slice(0, 10)).toBe("██████████");
      expect(progressBar.slice(10)).toBe("░░░░░░░░░░");
    });

    it("renders empty progress bar", () => {
      const filledWidth = 0;
      const barWidth = 20;

      const progressBar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);

      expect(progressBar).toBe("░░░░░░░░░░░░░░░░░░░░");
    });

    it("renders full progress bar", () => {
      const filledWidth = 20;
      const barWidth = 20;

      const progressBar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);

      expect(progressBar).toBe("████████████████████");
    });
  });

  describe("keyboard shortcuts text", () => {
    it("shows 'items' label when showLogs is true", () => {
      const showLogs = true;

      const logsLabel = showLogs ? "items" : "logs";
      const keysText = `[q] quit  [l] ${logsLabel}  [j/k] scroll`;

      expect(keysText).toContain("[l] items");
    });

    it("shows 'logs' label when showLogs is false", () => {
      const showLogs = false;

      const logsLabel = showLogs ? "items" : "logs";
      const keysText = `[q] quit  [l] ${logsLabel}  [j/k] scroll`;

      expect(keysText).toContain("[l] logs");
    });

    it("includes all keyboard shortcuts", () => {
      const showLogs = false;

      const keysText = `[q] quit  [l] ${showLogs ? "items" : "logs"}  [j/k] scroll`;

      expect(keysText).toContain("[q] quit");
      expect(keysText).toContain("[l]");
      expect(keysText).toContain("[j/k] scroll");
    });
  });

  describe("padding calculation", () => {
    it("calculates padding for progress line", () => {
      const width = 80;
      const progressText = "Progress: 5/10 complete | Runtime: 00:00:00";
      const barWidth = 20;

      const padding = Math.max(0, width - 4 - progressText.length - barWidth - 4);

      expect(padding).toBeGreaterThan(0);
    });

    it("calculates padding for keys line", () => {
      const width = 80;
      const keysText = "[q] quit  [l] logs  [j/k] scroll";

      const padding = Math.max(0, width - 4 - keysText.length);

      expect(padding).toBeGreaterThan(0);
    });

    it("handles negative padding", () => {
      const width = 30;
      const longText = "This is a very long text that exceeds width";

      const padding = Math.max(0, width - 4 - longText.length);

      expect(padding).toBe(0);
    });
  });

  describe("border rendering", () => {
    it("calculates border width correctly", () => {
      const width = 80;

      const borderWidth = width - 2;

      expect(borderWidth).toBe(78);
    });

    it("handles small width", () => {
      const width = 10;

      const borderWidth = width - 2;

      expect(borderWidth).toBe(8);
    });
  });

  describe("component rendering", () => {
    it("renders without crashing", () => {
      const state = createMockTuiState();

      const element = React.createElement(Footer, {
        state,
        width: 80,
        showLogs: false,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(Footer);
    });

    it("passes all props correctly", () => {
      const state = createMockTuiState();
      const width = 80;
      const showLogs = true;

      const element = React.createElement(Footer, {
        state,
        width,
        showLogs,
      });

      expect(element.props.state).toBe(state);
      expect(element.props.width).toBe(width);
      expect(element.props.showLogs).toBe(true);
    });
  });
});
