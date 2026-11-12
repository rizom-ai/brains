import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import bookPackage from "@brains/book";
import type { EntityTypeConfig } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared book and book-section types on the brain's own entity store,
 * byte for byte as main's adapters stored them (the bytes in
 * fixtures/book-main-bytes.json were captured from the book class). The
 * file keeps every field it states; metadata indexes what the class
 * indexed; a read hands back the body, and a read as stored the file.
 */

const recordSchema = z.object({
  file: z.string(),
  stored: z.object({ content: z.string(), metadata: z.string() }),
  read: z.object({
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  }),
  exported: z.string(),
});
type MainRecord = z.output<typeof recordSchema>;
const main = z
  .object({
    book: recordSchema,
    sparseBook: recordSchema,
    section: recordSchema,
    sparseSection: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "book-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const readOnly = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
} as const;

/** Each type's config, as the book package registers it. */
function bookConfig(entityType: string): EntityTypeConfig {
  return entityType === "book-section"
    ? {
        classification: "content",
        includeInBroadSearch: true,
        projectionSourceRole: "canonical",
        defaultSort: [{ field: "id", direction: "asc" }],
        actionPolicy: readOnly,
        containedIn: "book",
      }
    : {
        classification: "content",
        includeInBroadSearch: true,
        projectionSource: false,
        projectionSourceRole: "excluded",
        actionPolicy: readOnly,
      };
}

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    bookPackage,
    "@brains/book",
    { pluginId: "book", ownedTypePluginId: "book-entity" },
    bookConfig,
  );
  stores.push(opened);
  return opened;
}

/** The body of a stored document, as a declared type's read hands it back. */
function bodyOf(document: string): string {
  return document.replace(/^---\n[\s\S]*?\n---\n/u, "").replace(/\n+$/u, "");
}

async function expectAsMain(
  opened: DeclaredEntityStore,
  entityType: string,
  id: string,
  record: MainRecord,
  // What the declared type stores in place of main's bytes, if not those.
  departs: (bytes: string) => string = (bytes) => bytes,
): Promise<void> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType, id, markdown: record.file },
  });
  const stored = await opened.stored(entityType, id);
  expect(stored?.content).toBe(departs(record.stored.content));
  expect(JSON.parse(stored?.metadata ?? "null")).toEqual(
    JSON.parse(record.stored.metadata),
  );
  const read = await opened.service.getEntity({ entityType, id });
  expect(read?.content).toBe(bodyOf(record.read.content));
  expect(read?.metadata).toEqual(record.read.metadata);
  const asStored = await opened.service.getEntity({
    entityType,
    id,
    source: true,
  });
  expect(asStored?.content).toBe(departs(record.exported));
}

describe("the declared book types on the entity store", () => {
  test("store a book as the book adapter wrote it", async () => {
    const opened = await store();
    // An explicit null the file states stays in it: the store keeps the
    // header a type does not write as the file states it. The class wrote
    // its whole header again, dropping nulls. The importer writes none.
    await expectAsMain(opened, "book", "erstes", main.book, (bytes) =>
      bytes.replace(
        "license: public-domain\n",
        "license: public-domain\nattribution: null\n",
      ),
    );
    await expectAsMain(opened, "book", "leeres", main.sparseBook);
  });

  test("store a section as the book-section adapter wrote it", async () => {
    const opened = await store();
    await expectAsMain(
      opened,
      "book-section",
      "erstes:00001-vorrede",
      main.section,
    );
    await expectAsMain(
      opened,
      "book-section",
      "erstes:00002-mitte",
      main.sparseSection,
    );
  });

  test("read a row main stored as main read it", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "book", id: "erstes", markdown: main.book.file },
    });
    await opened.rewrite(
      "book",
      "erstes",
      main.book.stored.content,
      main.book.stored.metadata,
    );
    const read = await opened.service.getEntity({
      entityType: "book",
      id: "erstes",
      source: true,
    });
    expect(read?.content).toBe(main.book.read.content);
    expect(read?.metadata).toEqual(main.book.read.metadata);
  });

  test("keep a re-imported file's header as it states it", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "book", id: "erstes", markdown: main.book.file },
    });
    const existing = await opened.service.getEntity({
      entityType: "book",
      id: "erstes",
    });
    if (!existing) throw new Error("No book");
    // As directory sync imports a changed file: the whole file, its metadata.
    const changed = main.sparseBook.file.replace("## Contents", "## Inhalt");
    await opened.service.upsertEntity({
      entity: {
        ...existing,
        content: changed,
        metadata:
          opened.service.deserializeEntity(changed, "book").metadata ?? {},
      },
    });
    expect((await opened.stored("book", "erstes"))?.content).toBe(
      main.sparseBook.stored.content.replace("## Contents", "## Inhalt"),
    );
  });
});
