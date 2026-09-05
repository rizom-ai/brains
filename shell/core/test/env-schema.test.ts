import { describe, expect, it } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { shellEnvVars } from "../src/env-schema";

describe("shellEnvVars", () => {
  it("includes the ai-service declarations", () => {
    const vars = shellEnvVars();
    const names = vars.map((decl) => decl.name);
    expect(names).toContain("AI_API_KEY");
    expect(names).toContain("AI_IMAGE_KEY");

    const apiKey = expectDefined(
      vars.find((decl) => decl.name === "AI_API_KEY"),
      "AI_API_KEY declaration",
    );
    expect(apiKey.required).toBe(true);
    expect(apiKey.sensitive).toBe(true);
    const imageKey = expectDefined(
      vars.find((decl) => decl.name === "AI_IMAGE_KEY"),
      "AI_IMAGE_KEY declaration",
    );
    expect(imageKey.required).toBeUndefined();
    expect(imageKey.sensitive).toBe(true);
  });

  it("declares each variable at most once", () => {
    const names = shellEnvVars().map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
