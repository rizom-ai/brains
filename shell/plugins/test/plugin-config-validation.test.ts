import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  PluginConfigValidationError,
  isMissingPluginConfig,
} from "../src/config";

const schema = z.strictObject({
  token: z.string(),
  nested: z.strictObject({ key: z.string() }).optional(),
  retries: z.number().optional(),
});

function validate(input: Record<string, unknown>): PluginConfigValidationError {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("Expected config validation to fail");
  return PluginConfigValidationError.fromZod("fixture", parsed.error, input);
}

describe("plugin config validation errors", () => {
  it("marks a required value that was not provided as missing", () => {
    const error = validate({ nested: {} });

    expect(error.issues.map((issue) => [issue.path, issue.missing])).toEqual([
      ["token", true],
      ["nested.key", true],
    ]);
    expect(isMissingPluginConfig(error)).toBe(true);
  });

  it("does not treat an unknown key as missing config", () => {
    const error = validate({ token: "t", stale: true });

    expect(error.issues[0]?.missing).toBe(false);
    expect(isMissingPluginConfig(error)).toBe(false);
  });

  it("does not treat a value of the wrong type as missing config", () => {
    const error = validate({ token: "t", retries: "three" });

    expect(isMissingPluginConfig(error)).toBe(false);
  });

  it("marks a custom rule as missing when its value is unset or it says so", () => {
    const either = z
      .object({ a: z.string().optional(), b: z.string().optional() })
      .superRefine((config, context) => {
        if (!config.a && !config.b)
          context.addIssue({
            code: "custom",
            message: "Set a or b",
            path: [],
            params: { missing: true },
          });
      });
    const parsed = either.safeParse({});
    if (parsed.success) throw new Error("Expected config validation to fail");

    expect(
      isMissingPluginConfig(
        PluginConfigValidationError.fromZod("fixture", parsed.error, {}),
      ),
    ).toBe(true);
  });

  it("is not missing config when a missing value comes with an invalid one", () => {
    const error = validate({ stale: true });

    expect(isMissingPluginConfig(error)).toBe(false);
  });
});
