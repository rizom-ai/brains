import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import swotEvalPackage from "@brains/assessment/eval";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import * as production from "../src";

const testCaseSchema = z.object({ plugin: z.string(), handler: z.string() });

const basicTestCase = testCaseSchema.parse(
  fromYaml(
    readFileSync(
      join(
        import.meta.dir,
        "..",
        "evals",
        "test-cases",
        "swot-derive-basic.yaml",
      ),
      "utf-8",
    ),
  ),
);

/** The eval brain's plugins, as evals/eval.yaml installs them. */
function evalPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    swotEvalPackage,
    {},
    { name: "@brains/assessment", version: "0.0.0-test" },
    { pluginId: "assessment" },
  );
}

describe("the SWOT eval entry", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let evalHandlers: string[];

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-swot-eval-${randomUUID()}`,
    });
    const shell = harness.getMockShell();
    shell.getProfileKindRegistry().finalize();
    evalHandlers = [];
    shell.registerEvalHandler = (pluginId, handlerId): void => {
      evalHandlers.push(`${pluginId}:${handlerId}`);
    };
  });

  it("is served from the eval entry, not the production one", () => {
    expect(Object.values(production)).not.toContain(swotEvalPackage);
  });

  it("installs the SWOT beside agent-discovery's agent and skill types", async () => {
    for (const plugin of evalPlugins()) await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypes().sort()).toEqual([
      "agent",
      "skill",
      "swot",
    ]);
  });

  it("registers the handler its test cases address", async () => {
    for (const plugin of evalPlugins()) await harness.installPlugin(plugin);

    expect(evalHandlers).toContain(
      `${basicTestCase.plugin}:${basicTestCase.handler}`,
    );
  });
});
