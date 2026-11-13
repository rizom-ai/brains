import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import conversationMemoryPackage from "@brains/conversation-memory";
import { createActionItem, moveActionItem } from "@brains/action-items";
import type { EntityTypeConfig } from "@brains/entity-service";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared summary, decision and action-item types on the brain's own
 * entity store, byte for byte as main's adapters stored them (the bytes in
 * fixtures/conversation-memory-main-bytes.json were captured from the
 * conversation-memory class). Every row is stored as main stored it and
 * keeps main's metadata. A summary and a decision read as their body, their
 * fields as metadata; an action item reads as its stored document, since
 * the board and its writers read a card's header from its content. A row
 * main stored reads, lists and searches before the boot pass that
 * re-derives declared metadata reaches it, which a job worker never runs,
 * and after, and the pass writes nothing to it.
 */

const storedSchema = z.object({
  content: z.string(),
  metadata: z.string(),
  visibility: z.string(),
});
const readSchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  visibility: z.string(),
});
const rowSchema = z.object({
  id: z.string(),
  stored: storedSchema,
  read: readSchema,
  exported: z.string(),
});
const importedSchema = rowSchema.extend({ file: z.string() });
const main = z
  .object({
    titles: z.record(
      z.string(),
      z.object({ created: z.string(), title: z.string() }),
    ),
    summaryCurrent: importedSchema,
    summaryLegacy: importedSchema,
    summaryMalformed: z.object({ file: z.string(), refused: z.string() }),
    decisionCurrent: importedSchema,
    decisionLegacy: importedSchema,
    itemCurrent: importedSchema,
    itemLegacy: importedSchema,
    itemBoard: importedSchema,
    itemCreated: rowSchema,
    itemMoved: rowSchema,
    itemLegacyMoved: rowSchema,
    flattened: z.object({
      moved: z.number(),
      listed: z.record(z.string(), z.array(z.string())),
      rows: z.record(
        z.string(),
        z.object({ stored: storedSchema, read: readSchema }),
      ),
    }),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "conversation-memory-main-bytes.json",
        ),
        "utf8",
      ),
    ),
  );

const RETIRED = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/** Each type's registration, as main's class registered it. */
function typeConfig(entityType: string): EntityTypeConfig {
  if (entityType === "summary")
    return {
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: ["conversationId", "entryCount", "projectionVersion"],
    };
  if (entityType === "decision") return { retiredFields: RETIRED };
  return {
    retiredFields: RETIRED,
    translatedFields: ["timeRange"],
    actionPolicy: { create: "never" },
  };
}

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    conversationMemoryPackage,
    "@brains/conversation-memory",
    "conversation-memory",
    typeConfig,
    [],
    {},
    (registry) =>
      registry.registerGrouping({
        key: "projects",
        field: "projects",
        label: "Projects",
        types: ["action-item"],
      }),
  );
  stores.push(opened);
  return opened;
}

const EVERY = { visibilityScope: "restricted" } as const;

interface RowView {
  stored: string | undefined;
  metadata: unknown;
  read: string | undefined;
  readMetadata: unknown;
  visibility: string | undefined;
}

async function rowOf(
  opened: DeclaredEntityStore,
  entityType: string,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored(entityType, id);
  const read = await opened.service.getEntity({ entityType, id, ...EVERY });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
    visibility: read?.visibility,
  };
}

/** The body under the header, as a body-and-metadata type reads it. */
function bodyOf(document: string): string {
  return readMarkdownFrontmatter(document).content.trim();
}

/** Main's row, read as the declared type reads it. */
function asMain(
  row: {
    stored: z.output<typeof storedSchema>;
    read: z.output<typeof readSchema>;
  },
  reads: "body" | "document",
): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read: reads === "body" ? bodyOf(row.read.content) : row.read.content,
    readMetadata: row.read.metadata,
    visibility: row.read.visibility,
  };
}

async function imported(
  opened: DeclaredEntityStore,
  entityType: string,
  id: string,
  markdown: string,
): Promise<RowView> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType, id, markdown },
  });
  return rowOf(opened, entityType, id);
}

describe("the declared conversation memory types on the entity store", () => {
  test("store imported summaries as the summary adapter wrote them, and refuse one main refused", async () => {
    const opened = await store();
    for (const row of [main.summaryCurrent, main.summaryLegacy]) {
      expect(await imported(opened, "summary", row.id, row.file)).toEqual(
        asMain(row, "body"),
      );
    }
    expect(
      opened.service.createEntityFromMarkdown({
        input: {
          entityType: "summary",
          id: "malformed",
          markdown: main.summaryMalformed.file,
        },
      }),
    ).rejects.toThrow();
    expect(await opened.stored("summary", "malformed")).toBeNull();
  });

  test("name a summary as main named it, by the day it was stored when it records no start", async () => {
    const opened = await store();
    for (const row of [main.summaryCurrent, main.summaryLegacy]) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "summary", id: row.id, markdown: row.file },
      });
    }
    for (const key of ["summaryCurrent", "summaryLegacy"] as const) {
      const expected = main.titles[key];
      if (!expected) throw new Error(`No title captured for ${key}`);
      await opened.setCreated(
        "summary",
        main[key].id,
        Date.parse(expected.created),
      );
      const read = await opened.service.getEntity({
        entityType: "summary",
        id: main[key].id,
        ...EVERY,
      });
      // As Studio and listings name a record: by its type's adapter.
      const adapter = opened.shell.getEntityRegistry().getAdapter("summary");
      expect(read && adapter.displayTitle?.(read)).toBe(expected.title);
    }
  });

  test("store imported decisions as the decision adapter wrote them", async () => {
    const opened = await store();
    for (const row of [main.decisionCurrent, main.decisionLegacy]) {
      expect(await imported(opened, "decision", row.id, row.file)).toEqual(
        asMain(row, "body"),
      );
    }
  });

  test("store imported action items as the action-item adapter wrote them", async () => {
    const opened = await store();
    for (const row of [main.itemCurrent, main.itemLegacy, main.itemBoard]) {
      expect(await imported(opened, "action-item", row.id, row.file)).toEqual(
        asMain(row, "document"),
      );
    }
  });

  test("store a pickup's card and the board's moves as main stored them", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "action-item",
        id: main.itemLegacy.id,
        markdown: main.itemLegacy.file,
      },
    });
    await createActionItem(
      {
        entityService: opened.service,
        visibility: "restricted",
        now: () => new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "call-the-printer",
        title: "Call the printer",
        text: "Call the printer about the posters.",
        projected: true,
        actor: { kind: "user", userId: "u-niels" },
        actorName: "Niels",
        origin: {
          kind: "conversation",
          conversationId: "conv-1",
          interfaceType: "cli",
          channelId: "cli-terminal",
          channelName: "CLI Terminal",
        },
      },
    );
    expect(await rowOf(opened, "action-item", "call-the-printer")).toEqual(
      asMain(main.itemCreated, "document"),
    );
    const moving = {
      entityService: opened.service,
      visibilityScope: "restricted" as const,
      now: (): Date => new Date("2026-04-02T00:00:00.000Z"),
    };
    await moveActionItem(moving, {
      id: "call-the-printer",
      from: "open",
      to: "done",
    });
    expect(await rowOf(opened, "action-item", "call-the-printer")).toEqual(
      asMain(main.itemMoved, "document"),
    );
    await moveActionItem(moving, {
      id: main.itemLegacy.id,
      from: "open",
      to: "doing",
    });
    expect(await rowOf(opened, "action-item", main.itemLegacy.id)).toEqual(
      asMain(main.itemLegacyMoved, "document"),
    );
  });

  test("move colon ids to flat ids once startup content settles, as main moved them", async () => {
    const opened = await store();
    for (const [entityType, row] of [
      ["summary", main.summaryCurrent],
      ["summary", main.summaryLegacy],
      ["decision", main.decisionCurrent],
      ["decision", main.decisionLegacy],
      ["action-item", main.itemCurrent],
      ["action-item", main.itemBoard],
    ] as const) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType, id: row.id, markdown: row.file },
      });
    }
    // The legacy card and the pickup's card, each as the board left it.
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "action-item",
        id: main.itemLegacyMoved.id,
        markdown: main.itemLegacyMoved.exported,
      },
    });
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "action-item",
        id: main.itemMoved.id,
        markdown: main.itemMoved.exported,
      },
    });

    await opened.settleStartupContent();

    for (const [entityType, ids] of Object.entries(main.flattened.listed)) {
      const listed = await opened.service.listEntities({
        entityType,
        options: { filter: EVERY },
      });
      expect(listed.map(({ id }) => id).sort()).toEqual(ids);
    }
    for (const [key, row] of Object.entries(main.flattened.rows)) {
      const [entityType = "", id = ""] = key.split("/");
      expect(await rowOf(opened, entityType, id)).toEqual(
        asMain(row, entityType === "action-item" ? "document" : "body"),
      );
    }
  });

  test("read, list and search rows main stored, before the boot pass and after", async () => {
    const opened = await store();
    const rows = [
      ["summary", main.summaryCurrent, "launch"],
      ["decision", main.decisionCurrent, "Monday"],
      ["action-item", main.itemCurrent, "venue"],
    ] as const;
    for (const [entityType, row] of rows) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType, id: row.id, markdown: row.file },
      });
      // The row exactly as main stored it, dated as an older row is.
      await opened.rewrite(
        entityType,
        row.id,
        row.stored.content,
        row.stored.metadata,
      );
      await opened.setCreated(entityType, row.id, 1_700_000_000_000);
    }
    const before = await Promise.all(
      rows.map(([entityType, row]) => opened.stored(entityType, row.id)),
    );
    const updatedOf = (): Promise<(string | undefined)[]> =>
      Promise.all(
        rows.map(
          async ([entityType, row]) =>
            (
              await opened.service.getEntity({
                entityType,
                id: row.id,
                ...EVERY,
              })
            )?.updated,
        ),
      );
    const updatedBefore = await updatedOf();
    const exportsBefore = await opened.service.listPendingEntityExports();

    // A job worker reads this way throughout: it never runs the pass.
    const expectReadable = async (): Promise<void> => {
      for (const [entityType, row, word] of rows) {
        const reads = entityType === "action-item" ? "document" : "body";
        expect(await rowOf(opened, entityType, row.id)).toEqual(
          asMain(row, reads),
        );
        const listed = await opened.service.listEntities({
          entityType,
          options: { filter: EVERY },
        });
        expect(listed.map(({ id, metadata }) => [id, metadata])).toEqual([
          [row.id, row.read.metadata],
        ]);
        const found = await opened.service.search({
          query: word,
          options: { types: [entityType], ...EVERY },
        });
        expect(found.map(({ entity }) => entity.id)).toEqual([row.id]);
      }
    };

    await expectReadable();
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    await expectReadable();
    // The pass wrote nothing: content, hash and update time are main's.
    expect(
      await Promise.all(
        rows.map(([entityType, row]) => opened.stored(entityType, row.id)),
      ),
    ).toEqual(before);
    expect(await updatedOf()).toEqual(updatedBefore);
    expect(await opened.service.listPendingEntityExports()).toEqual(
      exportsBefore,
    );
  });
});
