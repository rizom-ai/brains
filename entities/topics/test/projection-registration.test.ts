import { describe, expect, it, mock } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  createPluginHarness,
  expectTemplateDataSourcesResolve,
} from "@brains/plugins/test";
import { topics } from "../src";

/**
 * Install the topics package and return each plugin's capabilities.
 *
 * The package emits a service plugin and an entity plugin; the configured
 * extraction rule attaches to the entity plugin whose type it targets, so
 * a caller looking for it has to look at both.
 */
async function install(config: Record<string, unknown>): Promise<{
  capabilities: PluginCapabilities[];
  enqueue: ReturnType<typeof mock>;
  registerHandler: ReturnType<typeof mock>;
  harness: ReturnType<typeof createPluginHarness>;
}> {
  const harness = createPluginHarness({});
  const enqueue = mock(async () => "job-1");
  const registerHandler = mock(() => {});
  const jobQueue = harness.getMockShell().getJobQueueService();
  harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
    ...jobQueue,
    enqueue,
    registerHandler,
  });

  const plugins = instantiatePluginPackageDefinition(topics, config, {
    name: "@brains/topics",
    version: "0.1.0",
  });
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins as Plugin[]) {
    capabilities.push(await harness.installPlugin(plugin));
  }
  return { capabilities, enqueue, registerHandler, harness };
}

/**
 * The triggers an earlier design listened for. Extraction is scheduled by
 * the projection runtime now, so neither may start work.
 */
async function sendLegacyTriggers(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<void> {
  await harness.sendMessage(
    "sync:initial:completed",
    { success: true },
    "directory-sync",
  );
  await harness.sendMessage(
    "entity:updated",
    {
      entityType: "post",
      entityId: "post-1",
      entity: {
        id: "post-1",
        entityType: "post",
        content: "Published post",
        metadata: { status: "published" },
        contentHash: "hash-1",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    },
    "entity-service",
  );
}

function rulesOf(
  capabilities: PluginCapabilities[],
): NonNullable<PluginCapabilities["projectionRules"]>[number][] {
  return capabilities.flatMap(({ projectionRules }) => [
    ...(projectionRules ?? []),
  ]);
}

describe("topics projection registration", () => {
  it("registers one scheduler rule and starts no work of its own", async () => {
    const { capabilities, enqueue, registerHandler, harness } = await install({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    await sendLegacyTriggers(harness);

    const rules = rulesOf(capabilities);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      id: "topics-projection",
      targetType: "topic",
      sources: [{ kind: "entity", types: ["post"], excludeTypes: ["topic"] }],
    });
    expect(registerHandler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("registers no rule at all when auto extraction is disabled", async () => {
    const { capabilities, enqueue, harness } = await install({
      enableAutoExtraction: false,
      includeEntityTypes: ["post"],
    });

    await sendLegacyTriggers(harness);

    expect(rulesOf(capabilities)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("topics templates", () => {
  it("resolves every declared template data source", async () => {
    // The conversion gotcha: a template pointing at "topics:entities"
    // resolves to nothing once the runtime scopes ids itself.
    const { harness } = await install({ enableAutoExtraction: false });
    expectTemplateDataSourcesResolve(harness);
  });
});
