import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  bunTestTargets,
  collectWorkspacePackages,
  packagesMissingTestScript,
  readRootScripts,
  readWorkflowInvokedScripts,
  scriptPathsThatDoNotExist,
  scriptTestsNotCovered,
  uncoveredScriptTestFiles,
  workspaceScriptTestFiles,
} from "./test-wiring-inventory";

const repositoryRoot = join(import.meta.dir, "..");

describe("bunTestTargets", () => {
  test("extracts the paths a bun test command would run", () => {
    expect(
      bunTestTargets("bun test scripts/architecture-check.test.ts"),
    ).toEqual(["scripts/architecture-check.test.ts"]);
    expect(bunTestTargets("bun test scripts/")).toEqual(["scripts/"]);
  });

  test("ignores flags but keeps every path argument", () => {
    expect(bunTestTargets("bun test --coverage scripts/ test/unit")).toEqual([
      "scripts/",
      "test/unit",
    ]);
  });

  test("returns an empty target list for a bare bun test", () => {
    expect(bunTestTargets("bun test")).toEqual([]);
  });

  test("returns null for commands that are not bun test invocations", () => {
    expect(bunTestTargets("turbo run test")).toBeNull();
    expect(bunTestTargets("bunx turbo run test --filter=x")).toBeNull();
    expect(bunTestTargets("bun --filter @brains/build-tools test")).toBeNull();
    expect(bunTestTargets("bun scripts/architecture-check.ts")).toBeNull();
  });
});

describe("packagesMissingTestScript", () => {
  test("reports packages that ship test files without a test script", () => {
    const missing = packagesMissingTestScript([
      {
        dir: "sites/professional",
        name: "a",
        scripts: { lint: "eslint ." },
        hasTestFiles: true,
      },
      {
        dir: "shell/core",
        name: "b",
        scripts: { test: "bun test" },
        hasTestFiles: true,
      },
      {
        dir: "shared/theme-base",
        name: "c",
        scripts: { lint: "eslint ." },
        hasTestFiles: false,
      },
    ]);

    expect(missing).toEqual(["sites/professional"]);
  });

  test("treats an empty test script as absent", () => {
    const missing = packagesMissingTestScript([
      { dir: "a", name: "a", scripts: { test: "" }, hasTestFiles: true },
    ]);

    expect(missing).toEqual(["a"]);
  });
});

describe("scriptTestsNotCovered", () => {
  test("a directory target covers every test file beneath it", () => {
    const uncovered = scriptTestsNotCovered(
      [
        "scripts/architecture-check.test.ts",
        "scripts/build-roadmap-visual.test.ts",
      ],
      { "test:scripts": "bun test scripts/" },
    );

    expect(uncovered).toEqual([]);
  });

  test("a file-pinned target leaves its siblings uncovered", () => {
    const uncovered = scriptTestsNotCovered(
      [
        "scripts/architecture-check.test.ts",
        "scripts/build-roadmap-visual.test.ts",
      ],
      { "arch:test": "bun test scripts/architecture-check.test.ts" },
    );

    expect(uncovered).toEqual(["scripts/build-roadmap-visual.test.ts"]);
  });

  test("non-bun-test scripts cover nothing", () => {
    const uncovered = scriptTestsNotCovered(["scripts/a.test.ts"], {
      test: "turbo run test",
    });

    expect(uncovered).toEqual(["scripts/a.test.ts"]);
  });
});

describe("scriptPathsThatDoNotExist", () => {
  test("flags a bun test path argument that resolves to nothing", () => {
    const broken = scriptPathsThatDoNotExist(
      {
        "test:integration": "bun test test/integration",
        "arch:test": "bun test scripts/architecture-check.test.ts",
      },
      (path) => path === "scripts/architecture-check.test.ts",
    );

    expect(broken).toEqual([
      { script: "test:integration", path: "test/integration" },
    ]);
  });

  test("ignores scripts that are not bun test invocations", () => {
    const broken = scriptPathsThatDoNotExist(
      { test: "turbo run test" },
      () => false,
    );

    expect(broken).toEqual([]);
  });
});

describe("uncoveredScriptTestFiles", () => {
  test("a covering script that CI never invokes leaves its tests uncovered", () => {
    const uncovered = uncoveredScriptTestFiles({
      scriptTestFiles: ["scripts/a.test.ts"],
      rootScripts: { "test:scripts": "bun test scripts/" },
      workflowInvokedScripts: new Set(["lint"]),
    });

    expect(uncovered).toEqual(["scripts/a.test.ts"]);
  });

  test("a covering script that CI invokes clears them", () => {
    const uncovered = uncoveredScriptTestFiles({
      scriptTestFiles: ["scripts/a.test.ts"],
      rootScripts: { "test:scripts": "bun test scripts/" },
      workflowInvokedScripts: new Set(["test:scripts"]),
    });

    expect(uncovered).toEqual([]);
  });
});

describe("repository test wiring", () => {
  test("every package with test files declares a test script", async () => {
    const packages = await collectWorkspacePackages(repositoryRoot);

    expect(packagesMissingTestScript(packages)).toEqual([]);
  });

  test("every scripts/ test file is run by a root script that CI invokes", async () => {
    const uncovered = uncoveredScriptTestFiles({
      scriptTestFiles: workspaceScriptTestFiles(repositoryRoot),
      rootScripts: await readRootScripts(repositoryRoot),
      workflowInvokedScripts: await readWorkflowInvokedScripts(repositoryRoot),
    });

    expect(uncovered).toEqual([]);
  });

  test("every bun test path in a root script resolves to something", async () => {
    const rootScripts = await readRootScripts(repositoryRoot);
    const existsInRepository = (path: string): boolean =>
      existsSync(join(repositoryRoot, path));

    expect(scriptPathsThatDoNotExist(rootScripts, existsInRepository)).toEqual(
      [],
    );
  });
});
