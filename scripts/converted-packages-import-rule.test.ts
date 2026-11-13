import { describe, expect, test } from "bun:test";
import { Linter } from "eslint";
import { z } from "@brains/utils/zod";
import { createRequire } from "node:module";
import { join } from "node:path";

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
const helperSubpath =
  'import { formatArtifactDisplay } from "@brains/plugins/message-interface/artifact-display";';
const shellPackage = 'import { EntityService } from "@brains/entity-service";';
const sdkImports = [
  'import { defineEntity } from "@brains/sdk/entities";',
  'import { defineServicePlugin } from "@brains/sdk/services";',
  'import { defineInterface } from "@brains/sdk/interfaces";',
  'import { entityRuntime } from "@brains/sdk/internal/entity-runtime";',
  'import { createTemplate } from "@brains/sdk/internal/presentation";',
  'import { serviceRuntime } from "@brains/sdk/internal/service-runtime";',
  'import { interfaceRuntime } from "@brains/sdk/internal/interface-runtime";',
  'import { formatArtifactDisplay } from "@brains/sdk/internal/message-display";',
];
const convertedMessage = expect.stringContaining(
  "A converted package is a declarative definition",
);
const shellMessage = expect.stringContaining(
  "Import from @brains/plugins instead",
);

/** Production files of converted entity, service and interface packages. */
const convertedFiles = [
  "entities/blog/src/schemas/blog-post.ts",
  "entities/portfolio/src/templates/project-list.tsx",
  "plugins/profile/src/helpers.ts",
  "plugins/unified-inbox/src/operator-service.ts",
  "interfaces/chat-repl/src/cli-interface.ts",
  "interfaces/web-chat/src/web-chat-interface.ts",
  "interfaces/web-chat/ui-react/src/ai-elements/data-parts.tsx",
];

describe("a converted package's imports", () => {
  test.each(convertedFiles)(
    "%s refuses @brains/plugins, its subpaths and its class bases",
    (file) => {
      const rule = importRuleFor(file);

      expect(messagesFor(rule, helper)).toEqual([convertedMessage]);
      expect(messagesFor(rule, helperSubpath)).toEqual([convertedMessage]);
      expect(messagesFor(rule, classBase)).toEqual([convertedMessage]);
    },
  );

  test.each(convertedFiles)(
    "%s admits @brains/sdk and its internal entries",
    (file) => {
      const rule = importRuleFor(file);

      for (const source of sdkImports) {
        expect(messagesFor(rule, source)).toEqual([]);
      }
    },
  );

  test.each(convertedFiles)(
    "%s keeps the shell packages out, as every production file does",
    (file) => {
      const rule = importRuleFor(file);

      expect(messagesFor(rule, shellPackage)).toEqual([convertedMessage]);
      expect(
        messagesFor(rule, 'import { ServerManager } from "@brains/http-host";'),
      ).toEqual([convertedMessage]);
      expect(
        messagesFor(
          rule,
          'import { createTemplate } from "@brains/templates";',
        ),
      ).toEqual([convertedMessage]);
    },
  );

  test("leave a converted package's tests on the plugins package", () => {
    // A test still builds its harness through @brains/plugins/test.
    const rule = importRuleFor("entities/blog/test/plugin.test.ts");

    expect(messagesFor(rule, helper)).toEqual([]);
    expect(
      messagesFor(
        rule,
        'import { createPluginHarness } from "@brains/plugins/test";',
      ),
    ).toEqual([]);
    expect(messagesFor(rule, shellPackage)).toEqual([shellMessage]);
  });

  test("keep the runtime's HTTP host out of an interface's tests", () => {
    expect(
      messagesFor(
        importRuleFor("interfaces/web-chat/test/web-chat.test.ts"),
        'import { ServerManager } from "@brains/http-host";',
      ),
    ).toEqual([shellMessage]);
  });

  test.each([
    "interfaces/not-yet-converted/src/plugin.ts",
    "plugins/oauth-broker/src/plugin.ts",
    "plugins/action-board/src/plugin.ts",
  ])("leave %s, not converted, on the plugins package", (file) => {
    const rule = importRuleFor(file);

    expect(messagesFor(rule, classBase)).toEqual([]);
    expect(messagesFor(rule, helper)).toEqual([]);
    expect(messagesFor(rule, shellPackage)).toEqual([shellMessage]);
  });
});

const repositoryRoot = join(import.meta.dir, "..");
const classBasePattern =
  /\bextends\s+(?:BasePlugin|EntityPlugin|HookedPublicPlugin|InterfacePlugin|MessageInterfacePlugin|PublicPlugin|ServicePlugin)\b/u;
const sdkImportPattern = /from\s+"@brains\/sdk(?:\/[^"]*)?"/u;

/**
 * Packages written as declarative definitions: their production code imports
 * @brains/sdk and extends no plugin class base.
 */
async function declarativePackages(): Promise<string[]> {
  const sources = new Map<string, string[]>();
  const glob = new Bun.Glob(
    "{entities,plugins,interfaces}/*/src/**/*.{ts,tsx}",
  );
  for await (const file of glob.scan({ cwd: repositoryRoot })) {
    if (/\.test\.tsx?$/u.test(file) || file.includes("/src/test/")) continue;
    const packagePath = file.split("/").slice(0, 2).join("/");
    const source = await Bun.file(join(repositoryRoot, file)).text();
    sources.set(packagePath, [...(sources.get(packagePath) ?? []), source]);
  }
  return [...sources.entries()]
    .filter(
      ([, files]) =>
        files.some((source) => sdkImportPattern.test(source)) &&
        !files.some((source) => classBasePattern.test(source)),
    )
    .map(([packagePath]) => packagePath)
    .sort();
}

describe("the converted package list", () => {
  test("covers every package written as a declarative definition", async () => {
    const packages = await declarativePackages();

    expect(packages.length).toBeGreaterThan(0);
    expect(
      packages.filter(
        (packagePath) =>
          messagesFor(importRuleFor(`${packagePath}/src/index.ts`), helper)
            .length === 0,
      ),
    ).toEqual([]);
  });
});
