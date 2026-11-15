import { describe, expect, it } from "bun:test";
import { shellEnvVars } from "../src/env-schema";

describe("shellEnvVars", () => {
  it("declares each provider's key, none of them required", () => {
    const keys = shellEnvVars().filter((decl) =>
      [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
      ].includes(decl.name),
    );

    expect(keys.map((decl) => decl.name).sort()).toEqual([
      "ANTHROPIC_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "OPENAI_API_KEY",
    ]);
    for (const decl of keys) {
      expect(decl.sensitive).toBe(true);
      expect(decl.required).toBeUndefined();
    }
  });

  it("no longer declares the single legacy keys", () => {
    const names = shellEnvVars().map((decl) => decl.name);
    expect(names).not.toContain("AI_API_KEY");
    expect(names).not.toContain("AI_IMAGE_KEY");
  });

  it("declares each variable at most once", () => {
    const names = shellEnvVars().map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
