import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { generateEntrypoint, parseInstanceOverrides } from "@brains/app";
import { scaffold, type ScaffoldOptions } from "../src/commands/init";
import { parseBrainYaml } from "../src/lib/brain-yaml";

const repositoryRoot = join(import.meta.dir, "../../..");

function source(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

function staticImportGraph(entry: string): Set<string> {
  const visited = new Set<string>();
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);

    const contents = readFileSync(path, "utf8");
    const imports = contents.matchAll(
      /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g,
    );
    for (const match of imports) {
      const reference = match[1];
      if (!reference) continue;
      const unresolved = resolve(dirname(path), reference);
      const dependency = [
        unresolved,
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        join(unresolved, "index.ts"),
      ].find((candidate) => existsSync(candidate));
      if (dependency) visit(dependency);
    }
  };

  visit(join(repositoryRoot, entry));
  return visited;
}

describe("single canonical crossover", () => {
  test("makes canonical package resolution the default", () => {
    const generated = generateEntrypoint(
      "bundleContract: capability-bundles-v1\nbundles: [core]\n",
    );

    expect(generated).toContain('import definition from "@rizom/brain/model"');
    expect(generated).not.toContain("@brains/brain");
  });

  test("defaults omitted brain names and rejects every legacy built-in name", () => {
    const directory = mkdtempSync(join(tmpdir(), "canonical-brain-yaml-"));
    try {
      writeFileSync(
        join(directory, "brain.yaml"),
        "bundleContract: capability-bundles-v1\nbundles: [core]\n",
      );
      expect(parseBrainYaml(directory).brain).toBe("brain");

      for (const legacy of [
        "rover",
        "relay",
        "ranger",
        "@brains/rover",
        "@brains/relay",
        "@brains/ranger",
      ]) {
        writeFileSync(
          join(directory, "brain.yaml"),
          `brain: ${JSON.stringify(legacy)}\npreset: core\n`,
        );
        expect(() => parseBrainYaml(directory)).toThrow(/config migrate/);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("removes preset parsing from the runtime instance contract", () => {
    expect(() =>
      parseInstanceOverrides("brain: brain\npreset: core\n"),
    ).toThrow(/preset/i);
    expect(
      parseInstanceOverrides(
        "brain: brain\nbundleContract: capability-bundles-v1\nbundles: [core]\n",
      ).bundles,
    ).toEqual(["core"]);
  });

  test("activates explicit recipe scaffolding with instance-owned seed content", () => {
    const directory = mkdtempSync(join(tmpdir(), "canonical-recipe-"));
    try {
      const options: ScaffoldOptions = {
        recipe: "professional",
        domain: "person.example.com",
      };
      scaffold(directory, options);
      const yaml = readFileSync(join(directory, "brain.yaml"), "utf8");

      expect(yaml).toContain("brain: brain");
      expect(yaml).toContain("anchor: person");
      expect(yaml).toContain("bundles:");
      for (const bundle of [
        "core",
        "media",
        "automation",
        "web",
        "chat",
        "site",
        "publishing",
        "federation",
      ]) {
        expect(yaml).toContain(`- ${bundle}`);
      }
      expect(yaml).not.toContain("preset:");
      expect(existsSync(join(directory, "seed-content"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("registers only one bundled canonical definition", () => {
    const entrypoint = source("packages/brain-cli/scripts/entrypoint.ts");
    const registry = source(
      "packages/brain-cli/src/lib/definition-registry.ts",
    );

    expect(entrypoint).toContain("setCanonicalDefinition(canonicalBrain)");
    expect(entrypoint).not.toMatch(/@brains\/(rover|relay|ranger)/);
    expect(entrypoint).not.toContain("registerModel");
    expect(registry).not.toContain("AVAILABLE_MODELS");
    expect(
      existsSync(
        join(repositoryRoot, "packages/brain-cli/src/lib/model-registry.ts"),
      ),
    ).toBe(false);
  });

  test("removes runtime preset contracts and eval preset selection", () => {
    for (const path of [
      "shell/app/src/brain-definition.ts",
      "shell/app/src/contracts/brain-definition.ts",
      "shell/app/src/brain-resolver.ts",
      "shell/app/src/instance-overrides.ts",
      "shell/ai-evaluation/src/cli-options.ts",
      "shell/ai-evaluation/src/eval-config-loader.ts",
    ]) {
      const contents = source(path);
      expect(contents, path).not.toContain("PresetName");
      expect(contents, path).not.toContain("PresetName");
      expect(contents, path).not.toContain("defaultPreset");
      expect(contents, path).not.toContain("presets:");
      expect(contents, path).not.toContain("overrides.preset");
    }
    expect(source("shell/ai-evaluation/src/cli-help.ts")).not.toContain(
      "--preset",
    );
  });

  test("removes active canonical crossover fallbacks", () => {
    expect(source("packages/brain-cli/src/commands/start.ts")).not.toContain(
      ".model-entrypoint.js",
    );
    expect(source("packages/brain-cli/scripts/entrypoint.ts")).not.toContain(
      "@brains/theme-default",
    );
    expect(source("shell/app/scripts/build.ts")).not.toContain(
      "brain.config.ts",
    );
  });

  test("keeps offline config migration outside the runtime boot graph", () => {
    const graph = staticImportGraph("packages/brain-cli/scripts/entrypoint.ts");

    expect(
      graph.has(
        join(
          repositoryRoot,
          "packages/brain-cli/src/lib/brain-config-migration.ts",
        ),
      ),
    ).toBe(false);
    expect(
      graph.has(
        join(
          repositoryRoot,
          "packages/brain-cli/src/commands/config-migrate.ts",
        ),
      ),
    ).toBe(false);
  });

  test("removes archetype packages after moving their owned assets", () => {
    for (const model of ["rover", "relay", "ranger"]) {
      // The manifest, not the directory. Builds and evals leave git-ignored
      // artifacts behind (dist, .turbo, cache, eval-results), so the directory
      // outlives the package on any checkout that ran the archetype before the
      // crossover, and a bare existsSync fails there while the repository is
      // in fact correct. Absence of the depth-1 package.json is what makes it
      // no longer a workspace package.
      expect(
        existsSync(join(repositoryRoot, "brains", model, "package.json")),
      ).toBe(false);
    }
    expect(
      existsSync(join(repositoryRoot, "packages/brain-cli/test-cases")),
    ).toBe(true);
    expect(
      existsSync(join(repositoryRoot, "packages/brain-cli/templates/recipes")),
    ).toBe(true);

    const packageJson = source("packages/brain-cli/package.json");
    expect(packageJson).not.toMatch(/"@brains\/(rover|relay|ranger)"/);
  });

  test("migrates all checked-in brain configs to explicit bundles", () => {
    const configs = [
      ...new Bun.Glob("**/brain.yaml").scanSync({
        cwd: repositoryRoot,
        dot: true,
      }),
    ];
    expect(configs.length).toBeGreaterThan(0);

    const retiredCanonicalSelections = new Set([
      "core,site",
      "core,publishing,site",
      "core,site,team",
    ]);
    for (const path of configs) {
      const yaml = source(path);
      expect(yaml, path).not.toMatch(/^brain:\s*(rover|relay|ranger)\s*$/m);
      expect(yaml, path).not.toMatch(/^preset:/m);
      expect(yaml, path).toMatch(/^bundles:/m);

      const parsed = parseInstanceOverrides(yaml);
      if (parsed.brain === undefined || parsed.brain === "brain") {
        expect(parsed.bundleContract, path).toBe("capability-bundles-v1");
        const selection = [...(parsed.bundles ?? [])].sort().join(",");
        expect(retiredCanonicalSelections.has(selection), path).toBe(false);
      }
    }
  });
});
