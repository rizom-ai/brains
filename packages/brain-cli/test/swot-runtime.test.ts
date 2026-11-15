import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { swotPackage } from "@brains/assessment";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared swot type on the brain's own entity store, byte for byte as
 * main's adapter stored, read and exported it (the bytes in
 * fixtures/swot-main-bytes.json were captured from the swot class). A SWOT
 * is all header, so it reads as its stored document, as the class read it,
 * and its metadata is the time it was derived. A row main stored reads and
 * lists before the boot pass that re-derives declared metadata reaches it
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
const main = z
  .object({
    imported: rowSchema.extend({ file: z.string() }),
    importedExtra: rowSchema.extend({ file: z.string() }),
    derived: rowSchema.extend({ written: z.string() }),
    rederived: rowSchema.extend({ written: z.string() }),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "swot-main-bytes.json"),
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
    swotPackage,
    "@brains/assessment",
    "swot",
    {
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
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
  exported: string | undefined;
}

async function rowOf(
  opened: DeclaredEntityStore,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored("swot", id);
  const read = await opened.service.getEntity({
    entityType: "swot",
    id,
    ...EVERY,
  });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
    exported: read ? opened.service.serializeEntity(read) : undefined,
  };
}

function asMain(row: z.output<typeof rowSchema>): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read: row.read.content,
    readMetadata: row.read.metadata,
    exported: row.exported,
  };
}

describe("the declared swot type on the entity store", () => {
  test("stores imported SWOTs as the swot adapter wrote them", async () => {
    const opened = await store();
    for (const row of [main.imported, main.importedExtra]) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "swot", id: row.id, markdown: row.file },
      });
      expect(await rowOf(opened, row.id)).toEqual(asMain(row));
    }
  });

  test("stores a derivation's create and its re-derivation as main stored them", async () => {
    const opened = await store();
    await opened.service.createEntity({
      entity: {
        id: main.derived.id,
        entityType: "swot",
        content: main.derived.written,
        metadata: main.derived.read.metadata,
        visibility: "public",
      },
    });
    expect(await rowOf(opened, main.derived.id)).toEqual(asMain(main.derived));
    const existing = await opened.service.getEntity({
      entityType: "swot",
      id: main.derived.id,
    });
    if (!existing) throw new Error("No SWOT");
    await opened.service.updateEntity({
      entity: {
        ...existing,
        content: main.rederived.written,
        metadata: main.rederived.read.metadata,
      },
    });
    expect(await rowOf(opened, main.derived.id)).toEqual(
      asMain(main.rederived),
    );
  });

  test("reads and lists a row main stored, before the boot pass and after", async () => {
    const opened = await store();
    const row = main.imported;
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "swot", id: row.id, markdown: row.file },
    });
    await opened.rewrite(
      "swot",
      row.id,
      row.stored.content,
      row.stored.metadata,
    );
    await opened.setCreated("swot", row.id, 1_700_000_000_000);
    const before = await opened.stored("swot", row.id);
    const updatedOf = async (): Promise<string | undefined> =>
      (
        await opened.service.getEntity({
          entityType: "swot",
          id: row.id,
          ...EVERY,
        })
      )?.updated;
    const updatedBefore = await updatedOf();
    const exportsBefore = await opened.service.listPendingEntityExports();

    const expectReadable = async (): Promise<void> => {
      expect(await rowOf(opened, row.id)).toEqual(asMain(row));
      const listed = await opened.service.listEntities({
        entityType: "swot",
        options: { filter: EVERY },
      });
      expect(listed.map(({ id, metadata }) => [id, metadata])).toEqual([
        [row.id, row.read.metadata],
      ]);
    };

    await expectReadable();
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    await expectReadable();
    expect(await opened.stored("swot", row.id)).toEqual(before);
    expect(await updatedOf()).toBe(updatedBefore);
    expect(await opened.service.listPendingEntityExports()).toEqual(
      exportsBefore,
    );
  });
});
