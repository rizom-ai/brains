import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import topicsPackage from "@brains/topics";
import { entityTitle } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared topic on the brain's own entity store, byte for byte as
 * main's adapter stored it (the bytes in fixtures/topic-main-bytes.json
 * were captured from the topics class). A topic reads as its stored
 * document, as the class read it, and its metadata indexes nothing, as the
 * class indexed nothing: a row main stored reads, lists, searches and
 * renders with its title before the boot pass that re-derives declared
 * metadata reaches it and after, and the pass writes nothing to it.
 */

const rowSchema = z.object({
  stored: z.object({ content: z.string(), metadata: z.string() }),
  read: z.object({
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  }),
});
const importedSchema = rowSchema.extend({ file: z.string() });
const writtenSchema = rowSchema.extend({ written: z.string() });
const main = z
  .object({
    plain: importedSchema,
    legacySources: importedSchema,
    extraFields: importedSchema,
    created: writtenSchema,
    updated: writtenSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "topic-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    topicsPackage,
    "@brains/topics",
    "topics",
    { weight: 0.5, projectionSource: false, projectionSourceRole: "excluded" },
    [],
    { enableAutoExtraction: false },
  );
  stores.push(opened);
  return opened;
}

interface RowView {
  stored: string | undefined;
  metadata: unknown;
  read: string | undefined;
  readMetadata: unknown;
}

async function rowOf(
  opened: DeclaredEntityStore,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored("topic", id);
  const read = await opened.service.getEntity({ entityType: "topic", id });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
  };
}

function asMain(row: z.output<typeof rowSchema>): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read: row.read.content,
    readMetadata: row.read.metadata,
  };
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<RowView> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "topic", id, markdown },
  });
  return rowOf(opened, id);
}

describe("the declared topic on the entity store", () => {
  test("stores imported topics as the topics adapter wrote them", async () => {
    const opened = await store();
    expect(
      await imported(opened, "distributed-systems", main.plain.file),
    ).toEqual(asMain(main.plain));
    // The legacy Sources section is dropped on write, as the class did.
    expect(
      await imported(opened, "urban-data", main.legacySources.file),
    ).toEqual(asMain(main.legacySources));
    // Fields the type does not keep stay in the file.
    expect(
      await imported(opened, "colon-topic", main.extraFields.file),
    ).toEqual(asMain(main.extraFields));
  });

  test("stores an extraction's create and update as the class did", async () => {
    const opened = await store();
    await opened.service.createEntity({
      entity: {
        id: "green-software",
        entityType: "topic",
        content: main.created.written,
        visibility: "public",
        metadata: {},
      },
    });
    expect(await rowOf(opened, "green-software")).toEqual(asMain(main.created));
    const existing = await opened.service.getEntity({
      entityType: "topic",
      id: "green-software",
    });
    if (!existing) throw new Error("No topic");
    await opened.service.updateEntity({
      entity: { ...existing, content: main.updated.written, metadata: {} },
    });
    expect(await rowOf(opened, "green-software")).toEqual(asMain(main.updated));
  });

  test("reads, lists, searches and renders a row main stored, before the boot pass and after", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "topic",
        id: "distributed-systems",
        markdown: main.plain.file,
      },
    });
    // The row exactly as main stored it, dated as an older row is.
    await opened.rewrite(
      "topic",
      "distributed-systems",
      main.plain.stored.content,
      main.plain.stored.metadata,
    );
    await opened.setCreated("topic", "distributed-systems", 1_700_000_000_000);
    const before = await opened.stored("topic", "distributed-systems");
    const updatedBefore = (
      await opened.service.getEntity({
        entityType: "topic",
        id: "distributed-systems",
      })
    )?.updated;
    const exportsBefore = await opened.service.listPendingEntityExports();

    const expectReadable = async (): Promise<void> => {
      const read = await opened.service.getEntity({
        entityType: "topic",
        id: "distributed-systems",
      });
      expect(read?.content).toBe(main.plain.stored.content);
      expect(read && entityTitle(read)).toBe("Distributed Systems");
      const listed = await opened.service.listEntities({
        entityType: "topic",
      });
      expect(listed.map((topic) => [topic.id, entityTitle(topic)])).toEqual([
        ["distributed-systems", "Distributed Systems"],
      ]);
      const found = await opened.service.search({
        query: "machines",
        options: { types: ["topic"] },
      });
      expect(found.map(({ entity }) => entityTitle(entity))).toEqual([
        "Distributed Systems",
      ]);
      const rendered = await opened.fetchData(
        "topics:entities",
        { query: {} },
        z.object({
          topics: z.array(z.object({ id: z.string(), title: z.string() })),
        }),
        { entityService: opened.service },
      );
      expect(rendered.topics).toEqual([
        expect.objectContaining({
          id: "distributed-systems",
          title: "Distributed Systems",
        }),
      ]);
    };

    await expectReadable();
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    await expectReadable();
    // The pass wrote nothing: content, hash and update time are main's.
    expect(await opened.stored("topic", "distributed-systems")).toEqual(before);
    expect(
      (
        await opened.service.getEntity({
          entityType: "topic",
          id: "distributed-systems",
        })
      )?.updated,
    ).toBe(updatedBefore);
    // Nothing is queued for the file on disk.
    expect(await opened.service.listPendingEntityExports()).toEqual(
      exportsBefore,
    );
  });
});
