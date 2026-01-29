import { describe, it, expect } from "bun:test";
import { calculateSimilarity } from "../dream";

describe("Dreamer: Similarity Detection", () => {
  it("should return 1.0 for identical strings", () => {
    expect(calculateSimilarity("hello world", "hello world")).toBe(1.0);
    expect(calculateSimilarity("Fix bug", "Fix bug")).toBe(1.0);
  });

  it("should ignore case and special characters", () => {
    expect(calculateSimilarity("Hello World!", "hello world")).toBe(1.0);
    expect(calculateSimilarity("[DREAMER] Fix bug", "fix bug")).toBeGreaterThan(
      0.9,
    );
  });

  it("should detect high similarity for minor typos", () => {
    // "mian" vs "main"
    expect(
      calculateSimilarity("fix main loop", "fix mian loop"),
    ).toBeGreaterThan(0.9);
  });

  it("should detect low similarity for distinct concepts", () => {
    expect(
      calculateSimilarity("fix login bug", "add user profile"),
    ).toBeLessThan(0.5);
  });

  it("should handle prefix matching via Jaro-Winkler", () => {
    // Shared prefix "implement " boosts score
    const s1 = "implement autonomous agent";
    const s2 = "implement autonomous worker";
    expect(calculateSimilarity(s1, s2)).toBeGreaterThan(0.8);
  });

  it("should return 0 for completely different strings", () => {
    expect(calculateSimilarity("abc", "xyz")).toBe(0);
  });
});
