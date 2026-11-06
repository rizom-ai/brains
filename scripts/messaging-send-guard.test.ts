import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { Linter } from "eslint";
import { z } from "@brains/utils/zod";

const restriction = z.object({ selector: z.string(), message: z.string() });
const config = z
  .object({
    overrides: z.array(
      z.object({
        files: z.array(z.string()),
        excludedFiles: z.array(z.string()).optional(),
        rules: z.object({
          "no-restricted-syntax": z
            .tuple([z.literal("error")])
            .rest(restriction)
            .optional(),
        }),
      }),
    ),
  })
  .parse(createRequire(import.meta.url)("../shared/eslint-config/index.js"));

const guard = config.overrides.find((override) =>
  override.rules["no-restricted-syntax"]
    ?.slice(1)
    .some(
      (entry) =>
        typeof entry !== "string" && entry.message.includes("bus contract"),
    ),
);
if (!guard) throw new Error("Missing raw messaging.send guard");
const rule = guard.rules["no-restricted-syntax"];
const linter = new Linter();

function violations(code: string): string[] {
  const messages = linter.verify(code, [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: { "no-restricted-syntax": rule },
    },
  ]);
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

describe("raw messaging.send guard", () => {
  test("covers entity, plugin and interface production source only", () => {
    expect(guard.files).toEqual(
      expect.arrayContaining([
        "**/entities/*/src/**/*.ts",
        "**/plugins/*/src/**/*.ts",
        "**/interfaces/*/src/**/*.ts",
      ]),
    );
    expect(guard.excludedFiles).toEqual(
      expect.arrayContaining(["**/*.test.ts", "**/src/test/**"]),
    );
  });

  test.each([
    "context.messaging.send({ type: 'a', payload: {} });",
    "this.context.messaging.send({ type: 'a', payload: {} });",
    "messaging.send({ type: 'a', payload: {} });",
    "context.messaging.send({ type: 'a', payload: {}, broadcast: false });",
    "const { send } = context.messaging;",
    "run({ sendMessage: context.messaging.send });",
  ])("rejects %s", (code) => {
    expect(violations(code)).toEqual([
      expect.stringContaining("context.messaging.request"),
    ]);
  });

  test.each([
    "context.messaging.send({ type: 'a', payload: {}, broadcast: true });",
    "this.messaging.send({ broadcast: true, type: 'a', payload: {} });",
    "context.messaging.request(contract, {});",
    "context.messaging.command(contract, {});",
    "provider.send({ type: 'a', payload: {} });",
    "const { subscribe } = context.messaging;",
  ])("allows %s", (code) => {
    expect(violations(code)).toEqual([]);
  });

  test("keeps the restrictions every source file carries", () => {
    expect(violations("Bun.spawnSync(['ls']);")).toHaveLength(1);
    expect(violations("read({ visibilityScope: 'restricted' });")).toHaveLength(
      1,
    );
  });
});
