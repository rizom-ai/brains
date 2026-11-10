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

type Override = (typeof config.overrides)[number];

/** The overrides that carry a restriction whose message says `text`. */
function overridesSaying(text: string): Override[] {
  return config.overrides.filter((override) =>
    override.rules["no-restricted-syntax"]
      ?.slice(1)
      .some(
        (entry) => typeof entry !== "string" && entry.message.includes(text),
      ),
  );
}

const guards = overridesSaying("broadcast(channel, payload)");
const linter = new Linter();

function only(overrides: Override[]): Override {
  const [guard] = overrides;
  if (!guard || overrides.length !== 1) {
    throw new Error(
      `Expected one raw broadcast guard, found ${overrides.length}`,
    );
  }
  return guard;
}

const guard = only(guards);

function violations(code: string): string[] {
  const messages = linter.verify(code, [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: { "no-restricted-syntax": guard.rules["no-restricted-syntax"] },
    },
  ]);
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

// A plugin context's messaging has no raw send, so the type system refuses a
// raw `messaging.send`; a raw broadcast through any bus is left to this guard.
describe("raw broadcast guard", () => {
  test("covers entity, plugin, interface, shared, shell, package and site production source, but not the message bus", () => {
    expect(guard.files).toEqual(
      expect.arrayContaining([
        "**/entities/*/src/**/*.ts",
        "**/plugins/*/src/**/*.ts",
        "**/interfaces/*/src/**/*.ts",
        "**/shared/*/src/**/*.ts",
        "**/shell/*/src/**/*.ts",
        "**/packages/*/src/**/*.ts",
        "**/sites/*/src/**/*.ts",
      ]),
    );
    expect(guard.excludedFiles).toEqual(
      expect.arrayContaining([
        "**/shell/messaging-service/**",
        "**/*.test.ts",
        "**/src/test/**",
      ]),
    );
  });

  test.each([
    "await this.messageBus.send({ type: 'a', payload: {}, sender: 'shell', broadcast: true });",
    "messageBus.send({ broadcast: true, type: 'a', payload: {}, sender: 'shell' });",
    "void bus.send({ type, payload, sender, broadcast: true }).catch(() => undefined);",
    "this.bus.send({ type: 'a', payload: {}, sender: 'x', broadcast: true });",
  ])("rejects %s", (code) => {
    expect(violations(code)).toEqual([
      expect.stringContaining("broadcastChannel"),
    ]);
  });

  test.each([
    "await broadcastChannel(this.messageBus, shellReadyChannel, { timestamp }, 'shell');",
    "context.messaging.broadcast(initialSyncCompletedChannel, { success: true });",
    "await messageBus.send({ type: 'a', payload: {}, sender: 'shell' });",
    "await messageBus.send({ type: 'a', payload: {}, sender: 'shell', broadcast: false });",
    "channel.send({ type, payload: message.payload });",
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
