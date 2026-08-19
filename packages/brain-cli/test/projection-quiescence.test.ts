import { describe, expect, it, mock } from "bun:test";
import { parseInstanceOverrides, resolve, type AppConfig } from "@brains/app";
import { PluginManager, type Plugin } from "@brains/plugins";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { canonicalBrain } from "../src/model/canonical-brain";

function resolveProjectionConfig(): AppConfig {
  return resolve(
    canonicalBrain,
    {},
    parseInstanceOverrides(`brain: brain
bundles: [core, publishing]
plugins:
  social-media:
    autoGenerateOnBlogPublish: true
`),
  );
}

function getProjectionPlugins(plugins: Plugin[]): Plugin[] {
  const ids = new Set(["prompt", "topics", "skill", "swot"]);
  const selected = plugins.filter((plugin) => ids.has(plugin.id));
  expect(selected.map((plugin) => plugin.id)).toEqual([
    "prompt",
    "topics",
    "skill",
    "swot",
  ]);
  return selected;
}

describe("full preset projection resilience", () => {
  it("validates a scheduler-only projection graph", async () => {
    const config = resolveProjectionConfig();
    const shell = createMockShell();
    const pluginManager = PluginManager.createFresh(
      createSilentLogger(),
      shell.getDaemonRegistry(),
    );
    pluginManager.setShell(shell);
    for (const plugin of config.plugins ?? []) {
      pluginManager.registerPlugin(plugin);
    }

    await pluginManager.initializePlugins();
    shell.getProfileKindRegistry().finalize();
    shell.getChannelRegistry().finalize();
    await pluginManager.finalizePluginRegistrations();

    const graph = pluginManager.getProjectionGraphSnapshot();
    const projectionIds = graph.projections.map(({ id }) => id);
    expect(projectionIds).toEqual([
      "series-projection",
      "skill-derivation",
      "social-post-generation",
      "swot-derivation",
      "topics-projection",
    ]);
    expect(
      graph.projections.flatMap((projection) => projection.sources),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "entity" })]),
    );
    expect(
      pluginManager.getProjectionRulesSnapshot().map(({ id }) => id),
    ).toEqual(projectionIds);

    const edgeCauses = new Map(
      graph.edges.map((edge) => [`${edge.from} -> ${edge.to}`, edge.causes]),
    );
    expect(edgeCauses.get("topics-projection -> skill-derivation")).toEqual([
      "entity:topic",
    ]);
    expect(edgeCauses.get("skill-derivation -> swot-derivation")).toEqual([
      "entity:skill",
    ]);
    expect(
      edgeCauses.get("social-post-generation -> topics-projection"),
    ).toEqual(["entity:social-post"]);
    expect(graph.unknownSourceTypes).toEqual([]);

    await pluginManager.shutdownPlugins();
  });

  it("registers no AI-backed derivations for the hermetic smoke posture", async () => {
    const config = resolve(
      canonicalBrain,
      {},
      parseInstanceOverrides(`brain: brain
bundles: [core, publishing]
embedding:
  enabled: false
remove:
  - series
  - portfolio
  - content-pipeline
  - social-media
  - newsletter
  - stock-photo
plugins:
  topics:
    enableAutoExtraction: false
  agents:
    enableSkillDerivation: false
  assessment:
    enableSwotDerivation: false
`),
    );
    const shell = createMockShell();
    const pluginManager = PluginManager.createFresh(
      createSilentLogger(),
      shell.getDaemonRegistry(),
    );
    pluginManager.setShell(shell);
    for (const plugin of config.plugins ?? []) {
      pluginManager.registerPlugin(plugin);
    }

    await pluginManager.initializePlugins();
    shell.getProfileKindRegistry().finalize();
    shell.getChannelRegistry().finalize();
    await pluginManager.finalizePluginRegistrations();
    const aiBackedRules = pluginManager
      .getProjectionRulesSnapshot()
      .map(({ id }) => id)
      .filter(
        (id) =>
          id === "topics-projection" ||
          id === "skill-derivation" ||
          id === "swot-derivation",
      );
    await pluginManager.shutdownPlugins();

    expect(aiBackedRules).toEqual([]);
  });

  it("does not enqueue legacy projection jobs from event notifications", async () => {
    const config = resolveProjectionConfig();
    const shell = createMockShell();
    const enqueue = mock(async () => "job-1");
    const jobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
    });
    shell.getProfileKindRegistry().finalize();

    for (const plugin of getProjectionPlugins(config.plugins ?? [])) {
      await plugin.register(shell);
      shell.addPlugin(plugin);
    }

    await shell.getMessageBus().send({
      type: "sync:initial:completed",
      payload: { success: true },
      sender: "directory-sync",
      broadcast: true,
    });
    await shell.getMessageBus().send({
      type: "topics:batch-completed",
      payload: { created: 1, merged: 0, skipped: 0, batches: 1 },
      sender: "topics",
      broadcast: true,
    });
    await shell.getMessageBus().send({
      type: "entity:updated",
      payload: { entityType: "topic", entityId: "topic-1" },
      sender: "entity-service",
      broadcast: true,
    });

    expect(enqueue).not.toHaveBeenCalled();
  });
});
