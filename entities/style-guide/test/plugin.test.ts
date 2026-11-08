import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createStyleGuideContent, styleGuideFromRecord } from "../src";
import { styleGuidePlugin } from "./style-guide-plugin";

describe("StyleGuidePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-style-guide-${randomUUID()}`,
    });
  });

  test("registers a singleton style-guide entity type", async () => {
    const plugin = styleGuidePlugin();
    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("style-guide");
    expect(plugin.adapter.isSingleton).toBe(true);
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "style-guide",
    );
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("style-guide"),
    ).toMatchObject({ classification: "system", embeddable: false });
  });

  // The declared seed is planted once startup content has settled: after the
  // initial directory sync, or at boot when no sync was pending.
  test("creates a neutral default only once startup content has settled", async () => {
    await harness.installPlugin(styleGuidePlugin());

    expect(
      await harness.getEntityService().getEntity({
        entityType: "style-guide",
        id: "style-guide",
      }),
    ).toBeNull();

    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
    );

    const entity = await harness.getEntityService().getEntity({
      entityType: "style-guide",
      id: "style-guide",
    });
    expect(entity).not.toBeNull();
    if (!entity) throw new Error("Style guide was not created");
    expect(styleGuideFromRecord(entity)).toEqual({
      name: "Default style guide",
      guidance: "",
    });
  });

  test("does not overwrite style imported by directory sync", async () => {
    await harness.installPlugin(styleGuidePlugin());
    const content = createStyleGuideContent({
      name: "Imported style",
      voice: { summary: "Warm and exact" },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "style-guide",
        entityType: "style-guide",
        content,
        metadata: {
          name: "Imported style",
          voice: { summary: "Warm and exact" },
        },
      },
    });

    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
    );

    // The stored document, as an editor reads it.
    const entity = await harness.getEntityService().getEntityRaw({
      entityType: "style-guide",
      id: "style-guide",
      source: true,
    });
    expect(entity?.content).toBe(content);
  });
});
