import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";

/**
 * The dependency-cruiser rules that keep declared packages on the SDK,
 * checked against probe files written where those packages' sources live
 * and cruised with the repository's own configuration.
 */

const repositoryRoot = join(import.meta.dir, "..");
const PROBE = "__boundary-probe__";
const SDK_RULE = "declared-packages-import-only-the-sdk";
const CORE_RULE = "plugin-core-stays-in-the-plugin-runtime";

/** Every source root the SDK rule covers. */
const coveredRoots = [
  "entities/blog/src",
  "plugins/profile/src",
  "interfaces/chat-repl/src",
  "interfaces/web-chat/ui-react/src",
  "sites/personal/src",
  "shared/action-items/src",
  "shared/forms/src",
  "shared/media-page-composer/src",
  "shared/operator-view-react/src",
  "shared/site-atlas/src",
];

/** Every package under shell/, each a target the SDK rule refuses. */
const shellTargets = [
  "@brains/ai-evaluation",
  "@brains/ai-service",
  "@brains/app",
  "@brains/auth-service",
  "@brains/content-service",
  "@brains/conversation-service",
  "@brains/core",
  "@brains/entity-service",
  "@brains/http-host",
  "@brains/identity-service",
  "@brains/job-queue",
  "@brains/mcp-service",
  "@brains/messaging-service",
  "@brains/plugins",
  "@brains/plugins/site-declaration",
  "@brains/recurring-checks",
  "@brains/runtime-state",
  "@brains/scheduler",
  "@brains/scheduler/maintenance",
  "@brains/templates",
];

/** What a declared package may import. */
const admitted = [
  "@brains/sdk/entities",
  "@brains/sdk/services",
  "@brains/sdk/interfaces",
  "@brains/sdk/internal/entity-runtime",
  "@brains/sdk/internal/service-runtime",
  "@brains/sdk/internal/interface-runtime",
  "@brains/sdk/internal/presentation",
  "@brains/sdk/internal/site-runtime",
  "@brains/contracts",
  "@brains/utils/zod",
];

const importsOf = (modules: readonly string[]): string =>
  modules
    .map((module, index) => `import * as m${index} from "${module}";`)
    .concat(
      `export const probe = [${modules.map((_, i) => `m${i}`).join(", ")}];`,
    )
    .join("\n");

/** Each probe file, relative to the repository, and what it imports. */
const probes: Record<string, string> = {
  ...Object.fromEntries(
    coveredRoots.map((root) => [
      `${root}/${PROBE}.ts`,
      importsOf(["@brains/plugins"]),
    ]),
  ),
  [`entities/blog/src/${PROBE}-targets.ts`]: importsOf(shellTargets),
  [`entities/blog/src/${PROBE}-admitted.ts`]: importsOf(admitted),
  // A test still builds its harness through the plugins package.
  [`entities/blog/test/${PROBE}.test.ts`]: importsOf(["@brains/plugins"]),
  [`shell/core/src/${PROBE}.ts`]: importsOf(["../../plugins/src/plugin-core"]),
  [`shell/plugins/src/${PROBE}.ts`]: importsOf(["./plugin-core"]),
};

const violationsSchema = z.array(
  z.object({ from: z.string(), to: z.string(), rule: z.string() }),
);

/** Cruise the probes one level deep with the repository's configuration. */
async function cruiseProbes(): Promise<z.output<typeof violationsSchema>> {
  const runner = `
    import { cruise } from "dependency-cruiser";
    import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
    import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";
    const files = JSON.parse(process.argv[1]);
    const options = await extractDepcruiseOptions("./.dependency-cruiser.js");
    const tsConfig = extractTSConfig("tsconfig.depcruise.json");
    const result = await cruise(files, { ...options, outputType: undefined, maxDepth: 1 }, {}, { tsConfig });
    process.stdout.write(JSON.stringify(result.output.summary.violations.map((v) => ({ from: v.from, to: v.to, rule: v.rule.name }))));
  `;
  const child = Bun.spawn(
    [
      "node",
      "--require",
      join(import.meta.dir, "dependency-cruiser-typescript-compat.cjs"),
      "--input-type=module",
      "-e",
      runner,
      JSON.stringify(Object.keys(probes)),
    ],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`cruise failed: ${stderr}`);
  return violationsSchema.parse(JSON.parse(stdout));
}

let violations: z.output<typeof violationsSchema> = [];

beforeAll(async () => {
  for (const [file, source] of Object.entries(probes)) {
    await mkdir(dirname(join(repositoryRoot, file)), { recursive: true });
    await writeFile(join(repositoryRoot, file), `${source}\n`);
  }
  violations = await cruiseProbes();
}, 120_000);

afterAll(async () => {
  await Promise.all(
    Object.keys(probes).map((file) =>
      rm(join(repositoryRoot, file), { force: true }),
    ),
  );
});

const refused = (from: string, rule: string): string[] =>
  violations
    .filter((violation) => violation.from === from && violation.rule === rule)
    .map((violation) => violation.to);

describe(SDK_RULE, () => {
  test.each(coveredRoots)("refuses @brains/plugins from %s", (root) => {
    expect(refused(`${root}/${PROBE}.ts`, SDK_RULE)).toEqual([
      expect.stringMatching(/^shell\/plugins\//),
    ]);
  });

  test("refuses every shell package as a target", () => {
    expect(
      refused(`entities/blog/src/${PROBE}-targets.ts`, SDK_RULE).length,
    ).toBe(shellTargets.length);
    expect(
      refused(`entities/blog/src/${PROBE}-targets.ts`, SDK_RULE).every((to) =>
        to.startsWith("shell/"),
      ),
    ).toBe(true);
  });

  test("admits the SDK and the shared libraries", () => {
    expect(
      violations.filter(
        (violation) =>
          violation.from === `entities/blog/src/${PROBE}-admitted.ts`,
      ),
    ).toEqual([]);
  });

  test("leaves a declared package's tests on the plugins package", () => {
    expect(refused(`entities/blog/test/${PROBE}.test.ts`, SDK_RULE)).toEqual(
      [],
    );
  });
});

describe(CORE_RULE, () => {
  test("refuses the plugin core outside the plugin runtime", () => {
    expect(refused(`shell/core/src/${PROBE}.ts`, CORE_RULE)).toEqual([
      "shell/plugins/src/plugin-core.ts",
    ]);
  });

  test("admits it inside the plugin runtime", () => {
    expect(refused(`shell/plugins/src/${PROBE}.ts`, CORE_RULE)).toEqual([]);
  });
});
