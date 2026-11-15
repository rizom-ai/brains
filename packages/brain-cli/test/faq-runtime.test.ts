import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import faqPackage, {
  faqFrontmatterSchema,
  faqRecord,
  faqSchema,
  prepareFaqMerge,
} from "@brains/faq";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared faq on the brain's own entity store, byte for byte as main's
 * adapter stored it (the bytes in fixtures/faq-main-bytes.json were
 * captured from the faq class): current, sparse and legacy files, a
 * capture's write and two merges. A read hands back the body, in the
 * formatter's layout, and the metadata main indexed.
 */

const rowSchema = z.object({
  stored: z.object({ content: z.string(), metadata: z.string() }),
  read: z.object({
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  }),
});
const importedSchema = rowSchema.extend({ file: z.string() });
const main = z
  .object({
    current: importedSchema,
    sparse: importedSchema,
    legacyBody: importedSchema,
    frontmatterSources: importedSchema,
    quotedSources: importedSchema,
    captured: rowSchema,
    merged: rowSchema,
    legacyMerged: rowSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "faq-main-bytes.json"),
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
    faqPackage,
    "@brains/faq",
    { pluginId: "faq", ownedTypePluginId: "faq-entity" },
    {
      projectionSource: false,
      projectionSourceRole: "excluded",
      includeInBroadSearch: false,
      translatedFields: ["sources"],
      publish: { publishStatuses: ["published"] },
    },
  );
  stores.push(opened);
  return opened;
}

/** The body of a stored document, as a declared type's read hands it back. */
function bodyOf(document: string): string {
  return document.replace(/^---\n[\s\S]*?\n---\n/u, "").replace(/\n+$/u, "");
}

interface RowView {
  stored: string | undefined;
  metadata: unknown;
  read: string | undefined;
  readMetadata: unknown;
}

/** A row as the store holds it and as an ordinary read hands it back. */
async function rowOf(
  opened: DeclaredEntityStore,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored("faq", id);
  const read = await opened.service.getEntity({ entityType: "faq", id });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
  };
}

/** What main stored for a row, and the body a declared read gives of it. */
function asMain(row: z.output<typeof rowSchema>): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read: bodyOf(row.stored.content),
    readMetadata: row.read.metadata,
  };
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  row: z.output<typeof importedSchema>,
): Promise<RowView> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "faq", id, markdown: row.file },
  });
  return rowOf(opened, id);
}

describe("the declared faq on the entity store", () => {
  test("stores current and sparse files as the faq adapter wrote them", async () => {
    const opened = await store();
    expect(await imported(opened, "reach", main.current)).toEqual(
      asMain(main.current),
    );
    expect(await imported(opened, "write", main.sparse)).toEqual(
      asMain(main.sparse),
    );
  });

  test("moves legacy files into the formatter's layout as the class did", async () => {
    const opened = await store();
    expect(await imported(opened, "old", main.legacyBody)).toEqual(
      asMain(main.legacyBody),
    );
    expect(await imported(opened, "sources", main.frontmatterSources)).toEqual(
      asMain(main.frontmatterSources),
    );
    expect(await imported(opened, "quoted", main.quotedSources)).toEqual(
      asMain(main.quotedSources),
    );
  });

  test("leaves a stored legacy row as it is until it is written", async () => {
    const opened = await store();
    await imported(opened, "old", main.legacyBody);
    // A row main stored before the formatter, as directory sync left it.
    await opened.rewrite(
      "faq",
      "old",
      main.legacyBody.file,
      main.legacyBody.stored.metadata,
    );
    const read = await opened.service.getEntity({
      entityType: "faq",
      id: "old",
    });
    // Read in the formatter's layout; the row itself is untouched.
    expect(read?.content.trimEnd()).toBe(
      bodyOf(main.legacyBody.stored.content),
    );
    expect((await opened.stored("faq", "old"))?.content).toBe(
      main.legacyBody.file,
    );
  });

  test("stores a capture's write and merges as the class did", async () => {
    const opened = await store();
    const frontmatter = faqFrontmatterSchema.parse({
      question: "Do you take commissions?",
      status: "draft",
    });
    await opened.service.createEntity({
      entity: {
        id: "commissions",
        entityType: "faq",
        ...faqRecord(
          frontmatter,
          "Yes, by email.",
          [],
          [{ id: "about", title: "About", url: "https://example.org/about" }],
        ),
        visibility: "public",
      },
    });
    expect(await rowOf(opened, "commissions")).toEqual(asMain(main.captured));

    await opened.service.createEntityFromMarkdown({
      input: { entityType: "faq", id: "reach", markdown: main.current.file },
    });
    const existing = faqSchema.parse(
      await opened.service.getEntity({
        entityType: "faq",
        id: "reach",
        source: true,
      }),
    );
    await opened.service.updateEntity({
      entity: prepareFaqMerge(existing, {
        asks: 2,
        alternatives: [{ answer: "Call us." }],
      }),
    });
    expect(await rowOf(opened, "reach")).toEqual(asMain(main.merged));

    await opened.service.createEntityFromMarkdown({
      input: { entityType: "faq", id: "old", markdown: main.legacyBody.file },
    });
    const old = faqSchema.parse(
      await opened.service.getEntity({
        entityType: "faq",
        id: "old",
        source: true,
      }),
    );
    await opened.service.updateEntity({
      entity: prepareFaqMerge(old, { asks: 1 }),
    });
    expect(await rowOf(opened, "old")).toEqual(asMain(main.legacyMerged));
  });
});
