import { expect, it } from "bun:test";
import {
  operatorMutation,
  operatorValidationCause,
} from "../src/service/operator-validation";
import { SdkError } from "@brains/contracts";

it("returns bounded detached field issues, keeping diagnostic causes private", async () => {
  const source = {
    name: "EntityValidationError",
    entityType: "note",
    originalError: {
      issues: [
        {
          path: ["labels"],
          message: "Choose a configured value",
          input: "private input",
        },
      ],
      secret: "private cause",
    },
  };
  const result = await operatorMutation(async (): Promise<never> => {
    throw source;
  });
  expect(result).toEqual({
    kind: "invalid",
    issues: [{ path: ["labels"], message: "Choose a configured value" }],
  });
  expect(operatorValidationCause(result)).toBe(source);
  expect(JSON.stringify(result)).not.toContain("private");
  source.originalError.issues[0]?.path.push("changed");
  expect(result.issues[0]?.path).toEqual(["labels"]);
  expect(Object.isFrozen(result.issues[0]?.path)).toBe(true);
});
it("caps issue counts, messages and paths", async () => {
  const result = await operatorMutation(async (): Promise<never> => {
    throw {
      issues: Array.from({ length: 100 }, () => ({
        path: Array(100).fill("x".repeat(500)),
        message: "x".repeat(2000),
      })),
    };
  });
  expect(result.issues).toHaveLength(50);
  expect(result.issues[0]?.path).toHaveLength(32);
  expect(result.issues[0]?.message).toHaveLength(1024);
  expect(result.issues[0]?.path[0]).toHaveLength(256);
});
it("normalizes unexpected failures and preserves conflict/cancellation codes without causes", async () => {
  for (const [cause, code] of [
    [new Error("private diagnostics"), "handler_failed"],
    [
      { name: "EntityWriteConflictError", message: "private target" },
      "conflict",
    ],
    [new SdkError("cancelled", { cause: "private cause" }), "cancelled"],
  ] as const) {
    const error: unknown = await operatorMutation(async (): Promise<never> => {
      throw cause;
    }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({ code });
    expect(JSON.stringify(error)).not.toContain("private");
    if (!(error instanceof Error)) throw new Error("Expected error");
    expect(error.cause).toBeUndefined();
  }
});
it("passes successful and denied outcomes unchanged", async () => {
  const denied = { kind: "denied", message: "No" };
  expect(await operatorMutation(async () => denied)).toBe(denied);
});
