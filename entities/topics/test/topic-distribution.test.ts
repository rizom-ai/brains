import { expect, test } from "bun:test";
import { defineEntity, defineEntityPackage, z } from "@brains/sdk/entities";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import topics from "../src";
import { createTopicBody } from "../src/lib/topic-body";

async function fixture(
  enableAutoExtraction: boolean,
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness();
  const sources = defineEntityPackage({
    id: "sources",
    entities: [
      defineEntity({
        type: "article",
        purpose: "Source",
        metadata: z.object({ status: z.string() }),
        config: { publish: { publishStatuses: ["published"] } },
      }),
      defineEntity({
        type: "derived",
        purpose: "Not a source",
        metadata: z.object({}),
        config: { projectionSource: false },
      }),
      defineEntity({
        type: "ignored",
        purpose: "Configured exclusion",
        metadata: z.object({}),
      }),
    ],
  });
  await harness.installPlugins(
    instantiatePluginPackageDefinition(
      sources,
      {},
      { name: "@fixture/sources", version: "1.0.0" },
    ),
  );
  await harness.installPlugins(
    instantiatePluginPackageDefinition(
      topics,
      {
        enableAutoExtraction,
        includeEntityTypes: ["*"],
        excludeEntityTypes: ["ignored"],
      },
      { name: "@brains/topics", version: "1.0.0" },
    ),
  );
  harness.addEntities([
    {
      id: "public",
      entityType: "article",
      content: "Published",
      visibility: "public",
      metadata: { status: "published" },
    },
    {
      id: "draft",
      entityType: "article",
      content: "Draft",
      visibility: "public",
      metadata: { status: "draft" },
    },
    {
      id: "private",
      entityType: "article",
      content: "Private",
      visibility: "restricted",
      metadata: { status: "published" },
    },
    {
      id: "derived",
      entityType: "derived",
      content: "Derived",
      visibility: "public",
      metadata: {},
    },
    {
      id: "ignored",
      entityType: "ignored",
      content: "Ignored",
      visibility: "public",
      metadata: {},
    },
  ]);
  return harness;
}

test.each([true, false])(
  "empty topic distribution explains visible sources with auto extraction %s",
  async (enabled) => {
    const harness = await fixture(enabled);
    try {
      const shell = harness.getMockShell();
      const read = (
        scope: "public" | "restricted",
      ): Promise<Record<string, unknown>> =>
        shell
          .getInsightsRegistry()
          .get("topic-distribution", shell.getEntityService(), scope);
      expect(await read("public")).toEqual({
        topics: [],
        unextracted: {
          sourceEntities: 1,
          hint: `${enabled ? "Topics have not been extracted yet; extraction runs in the background." : "Automatic topic extraction is off."} 1 visible entity exists: use system_search to answer from the content itself.`,
        },
      });
      expect(await read("restricted")).toMatchObject({
        topics: [],
        unextracted: { sourceEntities: 3 },
      });
      await shell
        .getEntityService()
        .deleteEntity({ entityType: "article", id: "public" });
      expect(await read("public")).toEqual({ topics: [] });
      harness.addEntities([
        {
          id: "visible-topic",
          entityType: "topic",
          visibility: "public",
          content: createTopicBody({
            title: "Visible topic",
            content: "Theme",
          }),
          metadata: {},
        },
      ]);
      expect(await read("public")).toEqual({
        topics: [{ topic: "visible-topic", title: "Visible topic" }],
      });
    } finally {
      await harness.reset();
    }
  },
);
