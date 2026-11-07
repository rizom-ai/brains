import { describe, expect, it } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadPluginEvalConfig, parseEvalYaml } from "@brains/ai-evaluation";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";

const repositoryRoot = join(import.meta.dir, "..", "..", "..");

const evalConfigPaths = Array.from(
  new Glob("*/*/evals/eval.yaml").scanSync({ cwd: repositoryRoot }),
).sort();

const testCaseSchema = z.object({
  type: z.string().optional(),
  plugin: z.string().optional(),
});

/** The plugin ids a package's plugin test cases address their handlers by. */
function addressedPluginIds(evalDirectory: string): string[] {
  const testCases = Array.from(
    new Glob("test-cases/**/*.yaml").scanSync({ cwd: evalDirectory }),
  ).map((file) =>
    testCaseSchema.parse(
      fromYaml(readFileSync(join(evalDirectory, file), "utf-8")),
    ),
  );
  return [
    ...new Set(
      testCases.flatMap((testCase) =>
        testCase.type === "plugin" && testCase.plugin ? [testCase.plugin] : [],
      ),
    ),
  ];
}

describe("plugin eval entries", () => {
  it("finds the plugin eval configs", () => {
    expect(evalConfigPaths).toContain("entities/assessment/evals/eval.yaml");
  });

  it.each(evalConfigPaths)(
    "%s loads the plugin its test cases address",
    async (path) => {
      const evalConfig = parseEvalYaml(
        readFileSync(join(repositoryRoot, path), "utf-8"),
      );
      if (!evalConfig) throw new Error(`${path} names no plugin`);

      const config = await loadPluginEvalConfig(evalConfig);

      expect(addressedPluginIds(join(repositoryRoot, dirname(path)))).toEqual(
        (config.plugins ?? []).map((plugin) => plugin.id),
      );
    },
  );
});
