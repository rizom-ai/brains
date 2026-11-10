import { describe, expect, test } from "bun:test";
import { Linter } from "eslint";
import { z } from "@brains/utils/zod";
import { createRequire } from "node:module";

// The shared lint config is CommonJS, read as the config ESLint loads.
const sharedConfig: unknown = createRequire(import.meta.url)(
  "../shared/eslint-config/index.js",
);

const ruleEntrySchema = z.custom<Linter.RuleEntry>(
  (value) => typeof value === "string" || Array.isArray(value),
);
const overrideSchema = z.object({
  files: z.array(z.string()),
  excludedFiles: z.array(z.string()).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
});
const configSchema = z.object({
  rules: z.record(z.string(), z.unknown()),
  overrides: z.array(overrideSchema),
});

const matches = (patterns: readonly string[], file: string): boolean =>
  patterns.some((pattern) => new Bun.Glob(pattern).match(file));

/**
 * The import restriction the shared lint config applies to a repo file: the
 * last override that covers it and sets the rule, as ESLint resolves them,
 * or the base rule.
 */
function importRuleFor(file: string): Linter.RuleEntry {
  const config = configSchema.parse(sharedConfig);
  const covering = config.overrides.filter(
    (override) =>
      matches(override.files, file) &&
      !matches(override.excludedFiles ?? [], file) &&
      override.rules?.["no-restricted-imports"] !== undefined,
  );
  const rule =
    covering.at(-1)?.rules?.["no-restricted-imports"] ??
    config.rules["no-restricted-imports"];
  return ruleEntrySchema.parse(rule);
}

/** What that restriction says about one line of source. */
function messagesFor(rule: Linter.RuleEntry, source: string): string[] {
  return new Linter()
    .verify(source, [
      {
        languageOptions: { sourceType: "module" },
        rules: { "no-restricted-imports": rule },
      },
    ])
    .map(({ message }) => message);
}

const classBase = 'import { MessageInterfacePlugin } from "@brains/plugins";';
const helper = 'import { buildResponsePlan } from "@brains/plugins";';
const shellPackage = 'import { EntityService } from "@brains/entity-service";';

describe("a converted interface package's imports", () => {
  test("refuse a plugin class base", () => {
    const rule = importRuleFor("interfaces/chat-repl/src/cli-interface.ts");

    expect(messagesFor(rule, classBase)).toEqual([
      expect.stringContaining(
        "A converted package is a declarative definition",
      ),
    ]);
    expect(
      messagesFor(
        rule,
        'import { ServicePlugin, BasePlugin } from "@brains/plugins";',
      ),
    ).toHaveLength(2);
  });

  test("still admit the rest of @brains/plugins", () => {
    const rule = importRuleFor("interfaces/chat-repl/src/cli-interface.ts");

    expect(messagesFor(rule, helper)).toEqual([]);
  });

  test("keep the shell packages out, as every interface's production code does", () => {
    const rule = importRuleFor("interfaces/chat-repl/src/cli-interface.ts");

    expect(messagesFor(rule, shellPackage)).toEqual([
      expect.stringContaining("Import from @brains/plugins instead"),
    ]);
  });

  test("leave an interface that has not converted alone", () => {
    const rule = importRuleFor(
      "interfaces/webserver/src/webserver-interface.ts",
    );

    expect(messagesFor(rule, classBase)).toEqual([]);
    expect(messagesFor(rule, shellPackage)).toEqual([
      expect.stringContaining("Import from @brains/plugins instead"),
    ]);
  });
});
