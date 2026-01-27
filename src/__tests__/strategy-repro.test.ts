import { describe, it, expect } from "bun:test";
import { parseGitStatusPorcelain } from "../git/status";

describe("Git Status Parser Bug Repro", () => {
  it("DEBUG PARSER", () => {
    const output = " M ROADMAP.md";
    const changes = parseGitStatusPorcelain(output, "/root");
    console.log("Parsed path:", `"${changes[0].path}"`);
    console.log("Parsed status:", `"${changes[0].statusCode}"`);
  });
});