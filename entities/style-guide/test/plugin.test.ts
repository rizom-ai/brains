import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createPluginHarness } from "@brains/plugins/test";
import { StyleGuidePlugin, styleGuideAdapter } from "../src";

describe("StyleGuidePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-style-guide-${randomUUID()}`,
    });
  });

  test("registers a singleton style-guide entity type", async () => {
    const plugin = new StyleGuidePlugin();
    await harness.installPlugin(plugin);

    expect(plugin.adapter.isSingleton).toBe(true);
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "style-guide",
    );
  });

  test("creates a neutral default only after initial directory sync", async () => {
    await harness.installPlugin(new StyleGuidePlugin());

    expect(
      await harness.getEntityService().getEntity({
        entityType: "style-guide",
        id: "style-guide",
      }),
    ).toBeNull();

    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");

    const entity = await harness.getEntityService().getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    expect(entity).not.toBeNull();
    if (!entity) throw new Error("Style guide was not created");
    expect(styleGuideAdapter.parseStyleGuide(entity.content)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
  });

  test("does not overwrite style imported by directory sync", async () => {
    await harness.installPlugin(new StyleGuidePlugin());
    const content = styleGuideAdapter.createStyleGuideContent({
      name: "Imported style",
      voice: { summary: "Warm and exact" },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "style-guide",
        entityType: "style-guide",
        content,
        metadata: {},
      },
    });

    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");

    const entity = await harness.getEntityService().getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    expect(entity?.content).toBe(content);
  });
});
