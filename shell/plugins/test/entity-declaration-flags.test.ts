import { expect, it } from "bun:test";
import { defineEntity, type EntityDefinitionConfig } from "../src";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";
import { createPluginHarness } from "../src/test/harness";
import { z } from "@brains/utils/zod";
import { createOperatorGroupings } from "../src/service/operator-groupings";

function plugins(
  config: EntityDefinitionConfig,
): ReturnType<typeof createEntityPackagePlugins> {
  return createEntityPackagePlugins(
    [
      defineEntity({
        type: "flagged",
        purpose: "Declaration flags",
        metadata: z.object({}),
        config,
      }),
    ],
    [],
    { name: "@fixture/flags", version: "0.0.0" },
    (id) => `@fixture/flags:${id}`,
  );
}

it("validates and detaches declaration flags without pinning omitted defaults", async () => {
  const harness = createPluginHarness();
  const config: EntityDefinitionConfig = {
    binaryStorage: "data-url",
    markdownImport: false,
    includeInBroadSearch: false,
    publish: { publishStatuses: ["approved"] },
    defaultSort: [
      { field: "publishedAt", direction: "desc", nullsFirst: true },
      { field: "rank", direction: "asc", nullsLast: true },
    ],
  };
  const installed = plugins(config);
  const sort = config.defaultSort?.[0];
  if (!sort) throw new Error("Missing sort fixture");
  sort.field = "changed-by-author";
  const rankSort = config.defaultSort[1];
  if (!rankSort) throw new Error("Missing rank sort fixture");
  rankSort.nullsLast = false;
  config.publish?.publishStatuses.push("draft");
  try {
    for (const plugin of installed) await harness.installPlugin(plugin);
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("flagged"),
    ).toMatchObject({
      binaryStorage: "data-url",
      markdownImport: false,
      includeInBroadSearch: false,
      defaultSort: [
        { field: "publishedAt", direction: "desc", nullsFirst: true },
        { field: "rank", direction: "asc", nullsLast: true },
      ],
    });
    const statuses = harness
      .getEntityRegistry()
      .getAdapter("flagged").publishedStatuses;
    expect(statuses).toEqual(["approved"]);
    expect(Object.isFrozen(statuses)).toBe(true);
    expect(
      createOperatorGroupings(harness.getMockShell()).canContribute("flagged"),
    ).toBe(false);
    expect(() =>
      harness.getEntityRegistry().registerGrouping({
        key: "areas",
        field: "areas",
        label: "Areas",
        types: ["flagged"],
      }),
    ).toThrow("Grouping requires an eligible content entity type");
    expect(plugins({})).toHaveLength(1);
  } finally {
    await harness.reset();
  }
});

for (const invalid of [
  { binaryStorage: "asset" },
  { binaryStorage: "unknown" },
  { markdownImport: "true" },
  { includeInBroadSearch: "false" },
  { defaultSort: [{ field: "rank", direction: "asc", nullsLast: "true" }] },
  { defaultSort: [{ field: "", direction: "desc" }] },
  { defaultSort: [{ field: "a".repeat(101), direction: "desc" }] },
  { defaultSort: [{ field: "created", direction: "sideways" }] },
  { defaultSort: [{ field: "created", direction: "desc", handler: "raw" }] },
  {
    defaultSort: Array.from({ length: 11 }, () => ({
      field: "created",
      direction: "desc",
    })),
  },
]) {
  it(`rejects malformed or unsupported declaration flags: ${JSON.stringify(invalid)}`, () => {
    const config: EntityDefinitionConfig = {};
    Object.assign(config, invalid);
    expect(() => plugins(config)).toThrow();
  });
}
