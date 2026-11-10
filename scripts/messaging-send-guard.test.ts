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

function required(override: Override | undefined, name: string): Override {
  if (!override) throw new Error(`Missing ${name}`);
  return override;
}

const guard = required(
  overridesSaying("bus contract")[0],
  "raw messaging.send guard",
);
const shellGuard = required(
  overridesSaying("broadcast(channel, payload)").find((override) =>
    override.files.includes("**/shell/*/src/**/*.ts"),
  ),
  "raw broadcast guard for the shell",
);
const linter = new Linter();

function violations(code: string, override: Override = guard): string[] {
  const messages = linter.verify(code, [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: "module" },
      rules: { "no-restricted-syntax": override.rules["no-restricted-syntax"] },
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
    "context.messaging.send({ type: 'a', payload: {}, broadcast: true });",
    "this.messaging.send({ broadcast: true, type: 'a', payload: {} });",
    "const { send } = context.messaging;",
    "run({ sendMessage: context.messaging.send });",
  ])("rejects %s", (code) => {
    expect(violations(code)).toContainEqual(
      expect.stringContaining("context.messaging.broadcast"),
    );
  });

  test.each([
    "context.messaging.broadcast(initialSyncCompletedChannel, { success: true });",
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

describe("raw broadcast guard", () => {
  test("covers shared, shell, package and site production source, but not the message bus", () => {
    expect(shellGuard.files).toEqual(
      expect.arrayContaining([
        "**/shared/*/src/**/*.ts",
        "**/shell/*/src/**/*.ts",
        "**/packages/*/src/**/*.ts",
        "**/sites/*/src/**/*.ts",
      ]),
    );
    expect(shellGuard.excludedFiles).toEqual(
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
  ])("rejects %s", (code) => {
    expect(violations(code, shellGuard)).toEqual([
      expect.stringContaining("broadcastChannel"),
    ]);
  });

  test.each([
    "await broadcastChannel(this.messageBus, shellReadyChannel, { timestamp }, 'shell');",
    "await messageBus.send({ type: 'a', payload: {}, sender: 'shell' });",
    "await messageBus.send({ type: 'a', payload: {}, sender: 'shell', broadcast: false });",
    "channel.send({ type, payload: message.payload });",
  ])("allows %s", (code) => {
    expect(violations(code, shellGuard)).toEqual([]);
  });

  test("is carried wherever a raw send is refused, so a plugin cannot broadcast raw through any bus", () => {
    expect(
      violations(
        "this.bus.send({ type: 'a', payload: {}, sender: 'x', broadcast: true });",
      ),
    ).toEqual([expect.stringContaining("broadcastChannel")]);
  });
});
