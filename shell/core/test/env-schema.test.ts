import { describe, expect, it } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { shellEnvVars } from "../src/env-schema";

describe("shellEnvVars", () => {
  it("includes the ai-service declarations", () => {
    const vars = shellEnvVars();
    // Which provider keys a brain needs depends on its models, so none is
    // required by the schema; `brain start` preflight checks the actual set.
    for (const name of [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "AI_API_KEY",
      "AI_IMAGE_KEY",
    ]) {
      const decl = expectDefined(
        vars.find((entry) => entry.name === name),
        `${name} declaration`,
      );
      expect(decl.required).toBeUndefined();
      expect(decl.sensitive).toBe(true);
    }
  });

  it("declares each variable at most once", () => {
    const names = shellEnvVars().map((decl) => decl.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
