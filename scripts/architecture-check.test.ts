import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  architectureStructuralEdges,
  parseArchitectureReporter,
  selectArchitectureSources,
} from "./architecture-source-inventory";

const repositoryRoot = join(import.meta.dir, "..");

describe("architecture source inventory", () => {
  test("selects authored JavaScript and TypeScript deterministically", () => {
    const inventory = selectArchitectureSources(repositoryRoot, [
      "shell/core/src/index.ts",
      "eslint.config.mjs",
      "shell/core/src/index.ts",
      "README.md",
      "missing.ts",
    ]);

    expect(inventory.selected).toEqual([
      "eslint.config.mjs",
      "shell/core/src/index.ts",
    ]);
    expect(inventory.excluded).toEqual([]);
  });

  test("classifies reviewed generated and standalone package graphs", () => {
    const brainDeployCopy =
      "packages/brain-cli/templates/deploy/scripts/provision-server.ts";
    const opsDeployCopy =
      "packages/brains-ops/templates/rover-pilot/deploy/scripts/provision-server.ts";
    const consumerFixture =
      "packages/brain-cli/test/fixtures/external-plugin/src/index.ts";
    const canonical =
      "shared/deploy-support/src/deploy-scripts/provision-server.ts";
    const inventory = selectArchitectureSources(repositoryRoot, [
      brainDeployCopy,
      opsDeployCopy,
      consumerFixture,
      canonical,
    ]);

    expect(inventory.selected).toEqual([canonical]);
    expect(inventory.excluded).toEqual([
      {
        path: brainDeployCopy,
        reason:
          "generated package copies; shared/deploy-support/src/deploy-scripts is canonical",
      },
      {
        path: consumerFixture,
        reason:
          "standalone packed and external-consumer package graphs have dedicated tests",
      },
      {
        path: opsDeployCopy,
        reason:
          "generated package copies; shared/deploy-support/src/deploy-scripts is canonical",
      },
    ]);
  });

  test("keeps one structural dependency sentinel for every workspace family", () => {
    expect(architectureStructuralEdges.map(({ family }) => family)).toEqual([
      "shell",
      "shared",
      "plugins",
      "entities",
      "interfaces",
      "sites",
      "packages",
    ]);
  });
});

describe("architecture reporter parsing", () => {
  test("defaults to the error reporter", () => {
    expect(parseArchitectureReporter([])).toBe("err");
  });

  test("accepts machine and graph reporters", () => {
    expect(parseArchitectureReporter(["--reporter", "json"])).toBe("json");
    expect(parseArchitectureReporter(["--reporter", "dot"])).toBe("dot");
  });

  test("rejects unsupported arguments", () => {
    expect(() => parseArchitectureReporter(["--reporter", "html"])).toThrow(
      "Unsupported architecture reporter",
    );
  });
});

test("dependency-cruiser loads the isolated TypeScript 6 compiler", () => {
  const result = Bun.spawnSync(
    [
      "node",
      "--require",
      join(import.meta.dir, "dependency-cruiser-typescript-compat.cjs"),
      "--input-type=module",
      "--eval",
      `import { getAvailableTranspilers } from "dependency-cruiser";
       const compiler = getAvailableTranspilers().find(({ name }) => name === "typescript");
       if (!compiler?.available || !compiler.currentVersion.startsWith("typescript@6.")) process.exit(1);`,
    ],
    { cwd: repositoryRoot },
  );

  expect(result.exitCode, result.stderr.toString()).toBe(0);
});
