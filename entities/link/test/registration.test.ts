import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { linkPlugin } from "./link-plugin";

/**
 * What the links register, pinned as the link plugin class registered it:
 * sites, queued jobs and the AT Protocol service name these by string.
 */
async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  evals: string[];
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createPluginHarness>["installPlugin"]>
  >;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("link-registration"),
  });
  const evals: string[] = [];
  harness.getMockShell().registerEvalHandler = (pluginId, id): void => {
    evals.push(`${pluginId}:${id}`);
  };
  const capabilities = await harness.installPlugin(linkPlugin());
  return { harness, evals, capabilities };
}

describe("the links' registered surface", () => {
  it("registers the link type under the link plugin", async () => {
    const { harness, capabilities } = await installed();
    const plugin = harness.getPlugin();
    expect(plugin.id).toBe("link");
    expect(plugin.type).toBe("entity");
    expect(plugin.packageName).toBe("@brains/link");
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(capabilities.instructions).toBeUndefined();
    expect(capabilities.projectionRules).toBeUndefined();
    const registry = harness.getEntityRegistry();
    expect(registry.getEntityTypeConfig("link")).toMatchObject({
      projectionSourceRole: "supporting",
      retiredFields: ["domain"],
    });
    const adapter = registry.getAdapter("link");
    expect(adapter.purpose).toBe(
      "A saved external URL or web resource captured for later reference.",
    );
    expect(adapter.supportsCoverImage ?? false).toBe(false);
    expect(adapter.buildStub).toBeUndefined();
    expect(adapter.getBodyTemplate()).toBe("");
    expect(registry.getCreateInterceptor("link")).toBeDefined();
  });

  it("registers its templates, data source, job types and eval", async () => {
    const { harness, evals } = await installed();
    expect(
      [...harness.getTemplates()]
        .filter(([name]) => name.startsWith("link:"))
        .map(([name, template]) => [name, template.dataSourceId ?? null])
        .sort(),
    ).toEqual([
      ["link:extraction", "shell:ai-content"],
      ["link:link-detail", "link:entities"],
      ["link:link-list", "link:entities"],
    ]);
    expect(
      [...harness.getDataSources().keys()].filter((id) =>
        id.startsWith("link:"),
      ),
    ).toEqual(["link:entities"]);
    expect(
      harness.getMockShell().getJobQueueService().getRegisteredTypes().sort(),
    ).toEqual(["link:capture", "link:generation"]);
    expect(evals).toEqual(["link:extractContent"]);
  });

  it("projects AT Protocol links", async () => {
    const { harness } = await installed();
    expect(
      harness.getMockShell().getAtprotoProjectionRegistry().get("link"),
    ).toMatchObject({ collection: "ai.rizom.brain.link", validate: false });
  });
});
