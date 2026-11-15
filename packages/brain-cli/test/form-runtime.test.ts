import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import formPackage from "@brains/form";
import { parseFormMarkdown } from "@brains/forms";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared form on the brain's own entity store, byte for byte as main's
 * adapter stored it (the bytes in fixtures/form-main-bytes.json were
 * captured from the form entity plugin class). A form reads as its stored
 * document, as the class read it: the forms engine parses its steps, copy
 * and scoring from the content. Metadata indexes its title, target and
 * path, which the engine lists forms by; a form whose file names no path
 * has none. A row main stored reads, lists and is found by its target
 * before the boot pass and after, unchanged, and a row main stored with
 * an empty path reads as a form without one.
 */

const recordSchema = z.object({
  id: z.string(),
  stored: z.object({ content: z.string(), metadata: z.string() }),
  read: z.object({
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    visibility: z.string(),
  }),
  exported: z.string(),
  listed: z.array(z.tuple([z.string(), z.string()])),
});
const importedSchema = recordSchema.extend({ file: z.string() });
const main = z
  .object({
    full: importedSchema,
    sparse: importedSchema,
    updated: recordSchema,
    pathless: z.object({
      file: z.string(),
      stored: z.object({ content: z.string(), metadata: z.string() }),
      read: z.null(),
    }),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "form-main-bytes.json"),
        "utf8",
      ),
    ),
  );

/**
 * A form whose file names no path, stored as the sparse form is but without
 * one: main wrote `path: ''` into it, which no read took. The forms engine
 * serves such a form beneath /forms, as it serves any form without a path.
 */
const pathless = {
  content: main.pathless.stored.content.replace("path: ''\n", ""),
  metadata: JSON.stringify({ title: "Fit: a check", target: "quiz-result" }),
};

/** Where the forms engine serves each form its listing finds. */
function servedAt(record: { listed: Array<[string, string]> }): string[][] {
  return record.listed.map(([id, content]) => [
    id,
    parseFormMarkdown(id, content).path,
  ]);
}

const EVERY = { visibilityScope: "restricted" } as const;

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    formPackage,
    "@brains/form",
    "form",
    {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
  );
  stores.push(opened);
  return opened;
}

async function recordOf(
  opened: DeclaredEntityStore,
  id: string,
): Promise<z.output<typeof recordSchema>> {
  const stored = await opened.stored("form", id);
  const read = await opened.service.getEntity({
    entityType: "form",
    id,
    ...EVERY,
  });
  if (!stored || !read) throw new Error(`Missing form ${id}`);
  const listed = await opened.service.listEntities({
    entityType: "form",
    options: {
      filter: {
        visibilityScope: "public",
        metadata: { target: read.metadata["target"] },
      },
    },
  });
  return {
    id,
    stored: { content: stored.content, metadata: stored.metadata },
    read: {
      content: read.content,
      metadata: read.metadata,
      visibility: read.visibility,
    },
    exported: opened.service.serializeEntity(
      (await opened.service.getEntity({
        entityType: "form",
        id,
        ...EVERY,
        source: true,
      })) ?? read,
    ),
    listed: listed.map((entity) => [entity.id, entity.content]),
  };
}

/** Main's record without the file it was imported from. */
function asMain(
  record: z.output<typeof recordSchema>,
): z.output<typeof recordSchema> {
  const { id, stored, read, exported, listed } = record;
  return { id, stored, read, exported, listed };
}

describe("the declared form on the entity store", () => {
  test("stores imported forms as the form adapter wrote them, and reads them whole", async () => {
    const opened = await store();
    for (const row of [main.full, main.sparse]) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "form", id: row.id, markdown: row.file },
      });
      expect(await recordOf(opened, row.id)).toEqual(asMain(row));
    }
  });

  test("writes an edited form back as main wrote it", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: { entityType: "form", id: main.full.id, markdown: main.full.file },
    });
    const read = await opened.service.getEntity({
      entityType: "form",
      id: main.full.id,
      ...EVERY,
    });
    if (!read) throw new Error("Missing form");
    await opened.service.updateEntity({
      entity: {
        ...read,
        content: read.content.replace("Tell us what", "Tell us all"),
      },
    });
    expect(await recordOf(opened, main.full.id)).toEqual(asMain(main.updated));
  });

  test("stores a form whose file names no path without one, reads it, and the engine serves it beneath /forms", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "form",
        id: "pathless",
        markdown: main.pathless.file,
      },
    });
    const record = await recordOf(opened, "pathless");
    expect(record).toEqual({
      id: "pathless",
      stored: pathless,
      read: {
        content: pathless.content,
        metadata: { title: "Fit: a check", target: "quiz-result" },
        visibility: "public",
      },
      exported: pathless.content,
      listed: [["pathless", pathless.content]],
    });
    expect(servedAt(record)).toEqual([["pathless", "/forms/pathless"]]);
  });

  test("writes an edited form that names no path without one", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "form",
        id: "pathless",
        markdown: main.pathless.file,
      },
    });
    const read = await opened.service.getEntity({
      entityType: "form",
      id: "pathless",
      ...EVERY,
    });
    if (!read) throw new Error("Missing form");
    await opened.service.updateEntity({
      entity: {
        ...read,
        content: read.content.replace("Question one", "The first question"),
      },
    });
    expect((await recordOf(opened, "pathless")).stored).toEqual({
      ...pathless,
      content: pathless.content.replace("Question one", "The first question"),
    });
  });

  test("reads a row main stored with an empty path as a form without one, before the boot pass and after, and drops it on the next write", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "form",
        id: "pathless",
        markdown: main.pathless.file,
      },
    });
    await opened.rewrite(
      "form",
      "pathless",
      main.pathless.stored.content,
      main.pathless.stored.metadata,
    );
    await opened.setCreated("form", "pathless", 1_700_000_000_000);
    const expectReadable = async (): Promise<void> => {
      const record = await recordOf(opened, "pathless");
      expect(record.read).toEqual({
        content: main.pathless.stored.content,
        metadata: { title: "Fit: a check", target: "quiz-result" },
        visibility: "public",
      });
      expect(servedAt(record)).toEqual([["pathless", "/forms/pathless"]]);
    };
    await expectReadable();
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });
    await expectReadable();
    expect((await opened.stored("form", "pathless"))?.metadata).toBe(
      pathless.metadata,
    );
    const read = await opened.service.getEntity({
      entityType: "form",
      id: "pathless",
      ...EVERY,
    });
    if (!read) throw new Error("Missing form");
    await opened.service.updateEntity({ entity: read });
    expect((await recordOf(opened, "pathless")).stored).toEqual(pathless);
  });

  test("refuses a form whose id is not a slug, as main did", async () => {
    const opened = await store();
    expect(
      opened.service.createEntityFromMarkdown({
        input: {
          entityType: "form",
          id: "Work With Us",
          markdown: main.full.file,
        },
      }),
    ).rejects.toThrow("Invalid form");
    expect(await opened.stored("form", "Work With Us")).toBeNull();
  });

  test("reads, lists and finds by target a row main stored, before the boot pass and after", async () => {
    const opened = await store();
    for (const row of [main.full, main.sparse]) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "form", id: row.id, markdown: row.file },
      });
      await opened.rewrite(
        "form",
        row.id,
        row.stored.content,
        row.stored.metadata,
      );
      await opened.setCreated("form", row.id, 1_700_000_000_000);
    }
    const before = await Promise.all(
      [main.full, main.sparse].map((row) => opened.stored("form", row.id)),
    );
    const expectReadable = async (): Promise<void> => {
      for (const row of [main.full, main.sparse]) {
        const record = await recordOf(opened, row.id);
        expect({ ...record, stored: row.stored }).toEqual(asMain(row));
      }
    };
    await expectReadable();
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    await expectReadable();
    expect(
      await Promise.all(
        [main.full, main.sparse].map((row) => opened.stored("form", row.id)),
      ),
    ).toEqual(before);
  });
});
