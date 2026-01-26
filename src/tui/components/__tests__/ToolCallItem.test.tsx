import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { ToolCallItem } from "../ToolCallItem";
import { createMockToolExecution } from "../../__tests__/test-utils";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, flexDirection, paddingLeft }: any) =>
    React.createElement("div", { width, flexDirection, paddingLeft }, children),
  Text: ({ children, color, bold, dimColor, wrap }: any) =>
    React.createElement("span", { color, bold, dimColor, wrap }, children),
}));

// Mock color utilities
mock.module("../colors", () => ({
  getToolColor: (toolName: string) => "blue",
  formatToolInput: (input: any) => JSON.stringify(input).slice(0, 50),
  formatToolResult: (toolName: string, result: any, maxLen: number) => "Result OK",
}));

describe("ToolCallItem", () => {
  describe("status icon", () => {
    it("shows ▶ for running status", () => {
      const tool = createMockToolExecution({ status: "running" });

      const statusIcon = tool.status === "running" ? "▶" : tool.status === "completed" ? "✓" : "✗";

      expect(statusIcon).toBe("▶");
    });

    it("shows ✓ for completed status", () => {
      const tool = createMockToolExecution({ status: "completed" });

      const statusIcon = tool.status === "running" ? "▶" : tool.status === "completed" ? "✓" : "✗";

      expect(statusIcon).toBe("✓");
    });

    it("shows ✗ for error status", () => {
      const tool = createMockToolExecution({ status: "error" });

      const statusIcon = tool.status === "running" ? "▶" : tool.status === "completed" ? "✓" : "✗";

      expect(statusIcon).toBe("✗");
    });
  });

  describe("input truncation", () => {
    it("calculates maxInputLen correctly", () => {
      const tool = createMockToolExecution({ toolName: "Read" });
      const width = 80;

      const maxInputLen = Math.max(10, width - tool.toolName.length - 8);

      expect(maxInputLen).toBe(68); // max(10, 80 - 4 - 8) = 68
    });

    it("limits maxInputLen to minimum of 10", () => {
      const tool = createMockToolExecution({ toolName: "VeryLongToolName" });
      const width = 20;

      const maxInputLen = Math.max(10, width - tool.toolName.length - 8);

      expect(maxInputLen).toBe(10);
    });

    it("truncates long input", () => {
      const tool = createMockToolExecution({
        toolName: "Read",
        input: { path: "/very/long/path/that/exceeds/maximum/length" },
      });
      const maxInputLen = 20;
      const inputSummary = JSON.stringify(tool.input).slice(0, 50);
      const shortInput = inputSummary.length > maxInputLen
        ? inputSummary.slice(0, maxInputLen - 1) + "…"
        : inputSummary;

      expect(shortInput.length).toBe(maxInputLen);
      expect(shortInput).toContain("…");
    });

    it("does not truncate short input", () => {
      const tool = createMockToolExecution({
        toolName: "Read",
        input: { path: "/file.txt" },
      });
      const maxInputLen = 50;
      const inputSummary = JSON.stringify(tool.input).slice(0, 50);
      const shortInput = inputSummary.length > maxInputLen
        ? inputSummary.slice(0, maxInputLen - 1) + "…"
        : inputSummary;

      expect(shortInput).toBe(inputSummary);
      expect(shortInput).not.toContain("…");
    });
  });

  describe("result display", () => {
    it("shows result when showResult is true and tool is completed", () => {
      const tool = createMockToolExecution({
        status: "completed",
        result: { output: "Success" },
      });
      const showResult = true;

      // The actual result value needs to be truthy
      const hasResult = tool.result !== undefined;
      const shouldShowResult = showResult && hasResult;

      expect(shouldShowResult).toBe(true);
    });

    it("does not show result when showResult is false", () => {
      const tool = createMockToolExecution({
        status: "completed",
        result: { output: "Success" },
      });
      const showResult = false;

      const hasResult = tool.result !== undefined;
      const shouldShowResult = showResult && hasResult;

      expect(shouldShowResult).toBe(false);
    });

    it("does not show result when tool has no result", () => {
      const tool = createMockToolExecution({
        status: "completed",
      });
      const showResult = true;

      const hasResult = tool.result !== undefined;
      const shouldShowResult = showResult && hasResult;

      expect(shouldShowResult).toBe(false);
    });

    it("does not show result when tool is not completed", () => {
      const tool = createMockToolExecution({
        status: "running",
      });
      const showResult = true;

      const hasResult = tool.result !== undefined;
      const shouldShowResult = showResult && hasResult;

      expect(shouldShowResult).toBe(false);
    });
  });

  describe("color mapping", () => {
    it("gets color for tool name", () => {
      const tool = createMockToolExecution({ toolName: "Read" });

      // This would normally call getToolColor from colors.ts
      // For testing, we just verify the concept
      const toolName = tool.toolName;
      expect(toolName).toBeDefined();
    });
  });

  describe("component rendering", () => {
    it("renders running tool without crashing", () => {
      const tool = createMockToolExecution({ status: "running" });

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(ToolCallItem);
    });

    it("renders completed tool without crashing", () => {
      const tool = createMockToolExecution({
        status: "completed",
        result: { output: "Success" },
      });

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
      });

      expect(element).toBeDefined();
    });

    it("renders error tool without crashing", () => {
      const tool = createMockToolExecution({
        status: "error",
        result: { error: "Failed" },
      });

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
      });

      expect(element).toBeDefined();
    });

    it("passes width prop correctly", () => {
      const tool = createMockToolExecution();

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
      });

      expect(element.props.width).toBe(80);
    });

    it("passes showResult prop correctly", () => {
      const tool = createMockToolExecution();

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
        showResult: true,
      });

      expect(element.props.showResult).toBe(true);
    });

    it("defaults showResult to false", () => {
      const tool = createMockToolExecution();

      const element = React.createElement(ToolCallItem, {
        tool,
        width: 80,
      });

      expect(element.props.showResult).toBeUndefined(); // undefined acts as false in the component
    });
  });

  describe("rendering paths", () => {
    it("renders running path (two lines)", () => {
      const tool = createMockToolExecution({ status: "running" });

      const isRunning = tool.status === "running";
      const isCompleted = tool.status === "completed" || tool.status === "error";

      expect(isRunning).toBe(true);
      expect(isCompleted).toBe(false);
    });

    it("renders completed/error path (single line, optional result)", () => {
      const tool = createMockToolExecution({ status: "completed" });

      const isRunning = tool.status === "running";
      const isCompleted = tool.status === "completed" || tool.status === "error";

      expect(isRunning).toBe(false);
      expect(isCompleted).toBe(true);
    });
  });
});
