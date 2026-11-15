import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import siteContentPackage from "@brains/site-content";
import { parseMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared site-content type on the brain's own entity store, byte for
 * byte as main's class stored it (the bytes in
 * fixtures/site-content-main-bytes.json were captured from the site-content
 * plugin class): a generated section, a file with the retired route and
 * section copies and one with a frontmatter key of its own as
 * directory-sync imports them, a regenerated body, and for each the stored
 * row, the read of the stored document and the export. An ordinary read is
 * the body alone, as every declared type's is; a site build reads saved
 * content as stored.
 */

const rowSchema = z.object({ content: z.string(), metadata: z.string() });
const readSchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
const recordSchema = z.object({
  stored: rowSchema,
  read: readSchema,
  raw: readSchema,
  exported: z.string(),
});
const main = z
  .object({
    generated: recordSchema,
    imported: z.object({ retired: recordSchema, loose: recordSchema }),
    retiredRewrite: z.object({ rewritten: z.number() }),
    afterRetire: recordSchema,
    updated: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "site-content-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const files = {
  plain: "# Hero\n\nWelcome to the brain.\n",
  retired: "---\nrouteId: home\nsectionId: intro\n---\n# Intro\n\nOld file.\n",
  loose: "---\nnote: kept by hand\n---\n# About\n\nA hand-written section.\n",
};

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    siteContentPackage,
    "@brains/site-content",
    // Under the id its class had; its type installs apart.
    { pluginId: "site-content", ownedTypePluginId: "site-content-entity" },
    { classification: "content", retiredFields: ["routeId", "sectionId"] },
  );
  stores.push(opened);
  return opened;
}

/** What main recorded for a record, its ordinary read the body alone. */
function declared(
  record: z.output<typeof recordSchema>,
): z.output<typeof recordSchema> {
  return {
    ...record,
    read: {
      ...record.read,
      content: parseMarkdown(record.read.content).content,
    },
  };
}

async function reads(
  opened: DeclaredEntityStore,
  id: string,
): Promise<z.output<typeof recordSchema>> {
  const { service } = opened;
  const read = await service.getEntity({ entityType: "site-content", id });
  // What a site build reads: raw, as stored.
  const raw = await service.getEntityRaw({
    entityType: "site-content",
    id,
    source: true,
  });
  const source = await service.getEntity({
    entityType: "site-content",
    id,
    source: true,
  });
  const stored = await opened.stored("site-content", id);
  if (!read || !raw || !source || !stored) throw new Error(`Missing ${id}`);
  return {
    stored: { content: stored.content, metadata: stored.metadata },
    read: { content: read.content, metadata: read.metadata },
    raw: { content: raw.content, metadata: raw.metadata },
    exported: service.serializeEntity(source),
  };
}

/** A file directory-sync imports, as the capture imported it. */
async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<void> {
  const parsed = opened.service.deserializeEntity(markdown, "site-content");
  await opened.service.upsertEntity({
    entity: {
      ...parsed,
      id,
      entityType: "site-content",
      content: markdown,
      visibility: "public",
      metadata: parsed.metadata ?? {},
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      contentHash: "",
    },
  });
}

describe("the declared site-content on the entity store", () => {
  test("stores a generated section as the class did", async () => {
    const opened = await store();
    // The content generation job creates it with the formatted body and
    // the destination's metadata.
    await opened.service.createEntity({
      entity: {
        id: "home:hero",
        entityType: "site-content",
        content: files.plain,
        metadata: {},
      },
    });

    expect(await reads(opened, "home:hero")).toEqual(declared(main.generated));
  });

  test("imports a file with retired copies and one with a key of its own as the class did", async () => {
    const opened = await store();
    await imported(opened, "home:intro", files.retired);
    await imported(opened, "about:main", files.loose);

    expect(await reads(opened, "home:intro")).toEqual(
      declared(main.imported.retired),
    );
    expect(await reads(opened, "about:main")).toEqual(
      declared(main.imported.loose),
    );
    expect(await opened.service.rewriteRetiredFields()).toEqual(
      main.retiredRewrite,
    );
    expect(await reads(opened, "home:intro")).toEqual(
      declared(main.afterRetire),
    );
  });

  test("stores a regenerated body as the class did", async () => {
    const opened = await store();
    await opened.service.createEntity({
      entity: {
        id: "home:hero",
        entityType: "site-content",
        content: files.plain,
        metadata: {},
      },
    });
    const existing = await opened.service.getEntity({
      entityType: "site-content",
      id: "home:hero",
    });
    if (!existing) throw new Error("Missing home:hero");
    await opened.service.updateEntity({
      entity: { ...existing, content: "# Hero\n\nWelcome back.\n" },
    });

    expect(await reads(opened, "home:hero")).toEqual(declared(main.updated));
  });
});
