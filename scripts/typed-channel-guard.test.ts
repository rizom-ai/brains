import { describe, expect, test } from "bun:test";
import Module, { createRequire } from "node:module";
import { Linter } from "eslint";
import { z } from "@brains/utils/zod";

const restriction = z.object({ selector: z.string(), message: z.string() });
const configRequire = createRequire(
  new URL("../shared/eslint-config/index.js", import.meta.url),
);
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
  .parse(configRequire("./index.js"));
const parserSchema = z.custom<Linter.Parser>(
  (value) =>
    typeof value === "object" && value !== null && "parseForESLint" in value,
);

/**
 * The config's own parser: the guard reads type arguments, which only it sees.
 * It needs the TypeScript 6 API that the lint wrapper's compat loader resolves;
 * the loader patches module resolution for the whole process, so the patch is
 * undone once the parser is loaded.
 */
function loadParser(): Linter.Parser {
  const resolve: unknown = Reflect.get(Module, "_resolveFilename");
  try {
    createRequire(import.meta.url)("./eslint-typescript-compat.cjs");
    return parserSchema.parse(configRequire("@typescript-eslint/parser"));
  } finally {
    Reflect.set(Module, "_resolveFilename", resolve);
  }
}
const parser = loadParser();

type Override = (typeof config.overrides)[number];
const guards = config.overrides.filter((override) =>
  override.rules["no-restricted-syntax"]
    ?.slice(1)
    .some(
      (entry) =>
        typeof entry !== "string" && entry.message.includes("typed channel"),
    ),
);

function only(overrides: Override[]): Override {
  const [guard] = overrides;
  if (!guard || overrides.length !== 1) {
    throw new Error(
      `Expected one typed channel guard, found ${overrides.length}`,
    );
  }
  return guard;
}

const guard = only(guards);
const linter = new Linter();

function violations(code: string): string[] {
  const rule = guard.rules["no-restricted-syntax"];
  const messages = linter.verify(code, [
    {
      languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
      rules: { "no-restricted-syntax": rule },
    },
  ]);
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

describe("typed channel subscription guard", () => {
  test("is the last override, over entity, plugin, interface, shared and shell production source", () => {
    expect(config.overrides.at(-1)).toEqual(guard);
    expect(guard.files).toEqual(
      expect.arrayContaining([
        "**/entities/*/src/**/*.ts",
        "**/plugins/*/src/**/*.ts",
        "**/interfaces/*/src/**/*.ts",
        "**/shared/*/src/**/*.ts",
        "**/shell/*/src/**/*.ts",
      ]),
    );
    expect(guard.excludedFiles).toEqual(
      expect.arrayContaining(["**/*.test.ts", "**/src/test/**"]),
    );
  });

  test("leaves out the message bus, and the one file allowed a full-scope read", () => {
    expect(guard.excludedFiles).toEqual(
      expect.arrayContaining([
        "**/shell/messaging-service/**",
        "**/entity-service/src/internal-scope.ts",
      ]),
    );
  });

  test.each([
    "context.messaging.subscribe<Payload>('a:b', handler);",
    "context.messaging.subscribe<Payload, { success: boolean }>(CHANNEL, handler);",
    "this.context.messaging.observe<Payload>(CHANNEL, handler);",
    "messaging.subscribeExecution<Payload>(CHANNEL, handler);",
    "context.messaging.observe<Record<string, unknown>, { recorded: boolean }>(CHANNEL, handler);",
  ])("rejects %s", (code) => {
    expect(violations(code)).toEqual([
      expect.stringContaining("typed channel"),
    ]);
  });

  test.each([
    "context.messaging.subscribe(publishCompletedChannel, async (payload) => ({ success: true }));",
    "context.messaging.observe(entityUpdatedChannel, handler);",
    "context.messaging.subscribeExecution(CHANNEL, handler);",
    "context.messaging.request<Contract>(contract, {});",
    "store.subscribe<State>(listener);",
    "observer.observe<Element>(node);",
  ])("allows %s", (code) => {
    expect(violations(code)).toEqual([]);
  });

  test("keeps the restrictions the overrides before it carry", () => {
    expect(violations("Bun.spawnSync(['ls']);")).toHaveLength(1);
    expect(violations("read({ visibilityScope: 'restricted' });")).toHaveLength(
      1,
    );
  });
});
