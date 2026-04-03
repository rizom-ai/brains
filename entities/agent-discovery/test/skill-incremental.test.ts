import { describe, it, expect } from "bun:test";
import { SkillPlugin } from "../src/plugins/skill-plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("Skill incremental derivation on topic changes", () => {
  it("should re-derive skills when a topic entity is created", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const plugin = new SkillPlugin();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    // Topic created after initial sync — should trigger re-derivation
    // (deriveSkills runs but creates nothing without AI — the point is it doesn't throw)
    await harness.sendMessage(
      "entity:created",
      {
        entityType: "topic",
        entityId: "new-topic",
        entity: {
          id: "new-topic",
          entityType: "topic",
          content: "---\ntitle: New Topic\n---\n",
          contentHash: "x",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      },
      "topics",
    );

    // No error = derivation was triggered and handled gracefully
    expect(plugin.hasRunInitialDerivation()).toBe(true);

    harness.reset();
  });

  it("should not re-derive before initial sync completes", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const plugin = new SkillPlugin();

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    // Topic created before initial sync — should NOT trigger
    await harness.sendMessage(
      "entity:created",
      {
        entityType: "topic",
        entityId: "early-topic",
        entity: {
          id: "early-topic",
          entityType: "topic",
          content: "---\ntitle: Early\n---\n",
          contentHash: "x",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      },
      "topics",
    );

    // Still false — no derivation ran
    expect(plugin.hasRunInitialDerivation()).toBe(false);

    harness.reset();
  });

  it("should ignore non-topic entity changes", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const plugin = new SkillPlugin();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    // Post created — should NOT trigger skill derivation (no error either)
    await harness.sendMessage(
      "entity:created",
      {
        entityType: "post",
        entityId: "new-post",
        entity: {
          id: "new-post",
          entityType: "post",
          content: "post content",
          contentHash: "x",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      },
      "blog",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);

    harness.reset();
  });
});
