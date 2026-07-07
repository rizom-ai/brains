import { describe, expect, it } from "bun:test";
import { shellEnvVars } from "../src/env-schema";

describe("shellEnvVars", () => {
  it("includes the ai-service declarations", () => {
    const vars = shellEnvVars();
    const names = vars.map((decl) => decl.name);
    expect(names).toContain("AI_API_KEY");
    expect(names).toContain("AI_IMAGE_KEY");

    const apiKey = vars.find((decl) => decl.name === "AI_API_KEY");
    expect(apiKey?.required).toBe(true);
    expect(apiKey?.sensitive).toBe(true);
    const imageKey = vars.find((decl) => decl.name === "AI_IMAGE_KEY");
    expect(imageKey?.required).toBeUndefined();
    expect(imageKey?.sensitive).toBe(true);
  });

  it("declares each variable at most once", () => {
    const names = shellEnvVars().map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
