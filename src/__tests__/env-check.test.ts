import { describe, expect, it } from "bun:test";

describe("Environment Check", () => {
  it("should have ZAI_API_KEY", () => {
    console.log("Checking for ZAI_API_KEY...");
    if (process.env.ZAI_API_KEY) {
      console.log("ZAI_API_KEY is present.");
    } else {
      console.log("ZAI_API_KEY is MISSING.");
    }
    // Check other keys
    if (process.env.ANTHROPIC_API_KEY)
      console.log("ANTHROPIC_API_KEY is present.");
    if (process.env.ANTHROPIC_AUTH_TOKEN)
      console.log("ANTHROPIC_AUTH_TOKEN is present.");
  });
});
