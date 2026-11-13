import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  withDisplayTitle,
  type AnyEntityDefinition,
} from "../src";

/**
 * A first-party type whose adapter named a record from the whole record
 * names it the same way: from its id, content, metadata and dates, as a
 * summary is named by its channel and the day its conversation started, or
 * the day it was stored when it records no start.
 */

const summaryMetadata = z.object({
  channel: z.string(),
  start: z.string().optional(),
});

const summary = withDisplayTitle(
  defineEntity({
    type: "summary",
    purpose: "A summary of a conversation.",
    metadata: summaryMetadata,
  }),
  ({ metadata, created }) =>
    `${metadata.channel} · ${(metadata.start ?? created).slice(0, 10)}`,
);

async function install(
  entities: readonly AnyEntityDefinition[],
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-display-title"),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memory", entities }),
    {},
    { name: "@fixture/memory", version: "0.1.0" },
  )) {
    await harness.installPlugin(plugin);
  }
  return harness;
}

const record = {
  id: "general-2026",
  entityType: "summary",
  content: "# Conversation Summary",
  contentHash: "hash",
  visibility: "public" as const,
  created: "2026-03-04T05:06:07.000Z",
  updated: "2026-03-05T05:06:07.000Z",
};

describe("a first-party entity type's title from the whole record", () => {
  it("reads the record's dates as well as its metadata", async () => {
    const harness = await install([summary]);
    try {
      const adapter = harness.getEntityRegistry().getAdapter("summary");
      expect(
        adapter.displayTitle?.({
          ...record,
          metadata: { channel: "general", start: "2026-01-01T00:00:00.000Z" },
        }),
      ).toBe("general · 2026-01-01");
      expect(
        adapter.displayTitle?.({ ...record, metadata: { channel: "general" } }),
      ).toBe("general · 2026-03-04");
    } finally {
      await harness.reset();
    }
  });

  it("names no record whose metadata the type does not read", async () => {
    const harness = await install([summary]);
    try {
      expect(
        harness
          .getEntityRegistry()
          .getAdapter("summary")
          .displayTitle?.({ ...record, metadata: { channel: 3 } }),
      ).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });

  it("is refused beside a title the definition already declares", () => {
    expect(() =>
      withDisplayTitle(
        defineEntity({
          type: "note",
          purpose: "A note.",
          metadata: z.object({ title: z.string() }),
          displayTitle: ({ metadata }) => metadata.title,
        }),
        ({ id }) => id,
      ),
    ).toThrow(/already declares a display title/);
  });
});
