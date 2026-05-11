import { describe, it, expect, mock } from "bun:test";
import { SkillPlugin } from "../src/plugins/skill-plugin";
import { SKILL_ENTITY_TYPE } from "../src/lib/constants";
import { createPluginHarness } from "@brains/plugins/test";

function installWithJobQueue(): {
  harness: ReturnType<typeof createPluginHarness<SkillPlugin>>;
  plugin: SkillPlugin;
  enqueue: ReturnType<typeof mock>;
  registerHandler: ReturnType<typeof mock>;
} {
  const harness = createPluginHarness<SkillPlugin>({});
  const enqueue = mock(async () => "job-1");
  const registerHandler = mock(() => {});

  harness.getMockShell().getJobQueueService = (): never =>
    ({
      enqueue,
      registerHandler,
      getActiveJobs: async () => [],
      getActiveBatches: async () => [],
      getBatchStatus: async () => null,
      getStatus: async () => null,
    }) as never;

  const plugin = new SkillPlugin();
  return { harness, plugin, enqueue, registerHandler };
}

describe("Skill derivation on initial sync", () => {
  it("should register skill entity type with projectionSource: false", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    await harness.installPlugin(new SkillPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig(SKILL_ENTITY_TYPE)
        .projectionSource,
    ).toBe(false);
  });

  it("should queue projection after sync:initial:completed", async () => {
    const { harness, plugin, enqueue, registerHandler } = installWithJobQueue();

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(registerHandler).toHaveBeenCalledWith(
      "skill:project",
      expect.any(Object),
      "skill",
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      type: "skill:project",
      data: { mode: "derive", replaceAll: true, reason: "initial-sync" },
      options: expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "skill-derivation:initial-sync",
      }),
    });

    harness.reset();
  });

  it("should only queue projection once across multiple sync events", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);

    // Second sync should not re-trigger
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);

    harness.reset();
  });

  it("should not queue initial replace-all when persisted skills already exist", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);
    harness.addEntities([
      {
        id: "existing-skill",
        entityType: "skill",
        content:
          "---\nname: Existing\ndescription: Existing skill\ntags: []\nexamples: []\n---\n",
        metadata: {
          name: "Existing",
          description: "Existing skill",
          tags: [],
          examples: [],
        },
      },
    ]);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });

  it("should queue topic-change derivation after initial sync even when bootstrap is skipped", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);
    harness.addEntities([
      {
        id: "existing-skill",
        entityType: "skill",
        content:
          "---\nname: Existing\ndescription: Existing skill\ntags: []\nexamples: []\n---\n",
        metadata: {
          name: "Existing",
          description: "Existing skill",
          tags: [],
          examples: [],
        },
      },
    ]);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(enqueue).not.toHaveBeenCalled();

    await harness.sendMessage(
      "entity:updated",
      { entityType: "topic", entityId: "topic-1" },
      "entity-service",
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      type: "skill:project",
      data: { mode: "derive", replaceAll: true, reason: "topic-change" },
      options: expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "skill-derivation:topic-change",
      }),
    });

    harness.reset();
  });
});
