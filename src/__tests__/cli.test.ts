import { describe, it, expect } from "bun:test";
import { program } from "../index";

describe("wreckit CLI", () => {
  it("should import without error", () => {
    expect(program).toBeDefined();
    expect(program.name()).toBe("wreckit");
  });

  it("should have correct version", () => {
    expect(program.version()).toBe("0.0.1");
  });

  it("should have correct description", () => {
    expect(program.description()).toBe(
      "A CLI tool for turning ideas into automated PRs through an autonomous agent loop",
    );
  });

  it("should have global options", () => {
    const options = program.options.map((opt) => opt.long);
    expect(options).toContain("--verbose");
    expect(options).toContain("--quiet");
    expect(options).toContain("--no-tui");
    expect(options).toContain("--dry-run");
  });

  it("--help includes usage information", () => {
    const helpInfo = program.helpInformation();
    expect(helpInfo).toContain("wreckit");
    expect(helpInfo).toContain("--help");
    expect(helpInfo).toContain("--version");
  });
});
