
import { describe, it } from "bun:test";

describe("Sanity Check", () => {
  it("prints indices", () => {
    const s = " M ROADMAP.md";
    console.log(`String: "${s}"`);
    console.log(`Length: ${s.length}`);
    for(let i=0; i<s.length; i++) {
        console.log(`${i}: '${s[i]}'`);
    }
    console.log(`substring(3): "${s.substring(3)}"`);
  });
});
