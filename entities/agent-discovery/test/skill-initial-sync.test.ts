import { describe, it, expect } from "bun:test";
import { SkillPlugin } from "../src/plugins/skill-plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("Skill derivation on initial sync", () => {
  it("should run deriveAll after sync:initial:completed", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const plugin = new SkillPlugin();

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);

    harness.reset();
  });

  it("should only run deriveAll once across multiple sync events", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const plugin = new SkillPlugin();

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

    harness.reset();
  });
});
