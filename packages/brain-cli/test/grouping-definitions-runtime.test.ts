import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import studioPackage from "@brains/studio";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared grouping-definitions type on the brain's own entity store,
 * byte for byte as main's adapter stored it (the bytes in
 * fixtures/grouping-definitions-main-bytes.json were captured from that
 * adapter): a document imported, then updated, then one that needs repair
 * imported over it. A read hands back the whole document as written, as
 * the class read it; metadata stays empty.
 */

const recordSchema = z.object({
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
    imported: recordSchema,
    updated: recordSchema,
    needsRepair: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "grouping-definitions-main-bytes.json",
        ),
        "utf8",
      ),
    ),
  );

const type = "grouping-definitions";
const valid =
  "---\ngroupings:\n  clients:\n    label: Clients\n    multiple: true\n    values: []\n---\n";
const needsRepair = "---\ngroupings:\n  clients:\n    label: 3\n---\n";

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    studioPackage,
    "@brains/studio",
    "studio",
    {
      classification: "system",
      embeddable: false,
      projectionSource: false,
      actionPolicy: {
        create: "admin",
        update: "admin",
        delete: "admin",
        publish: "never",
      },
    },
  );
  stores.push(opened);
  return opened;
}

async function reads(opened: DeclaredEntityStore): Promise<MainRecord> {
  const { service } = opened;
  const request = {
    entityType: type,
    id: type,
    visibilityScope: "restricted" as const,
  };
  const read = await service.getEntity(request);
  const source = await service.getEntity({ ...request, source: true });
  const stored = await opened.stored(type, type);
  if (!read || !source || !stored) throw new Error("Missing definitions");
  return {
    stored: { content: stored.content, metadata: stored.metadata },
    read: { content: read.content, metadata: read.metadata },
    exported: service.serializeEntity(source),
  };
}

/** A file imported, as directory sync imports one. */
async function importFile(
  opened: DeclaredEntityStore,
  file: string,
): Promise<void> {
  const parsed = opened.service.deserializeEntity(file, type);
  await opened.service.upsertEntity({
    entity: {
      ...parsed,
      id: type,
      entityType: type,
      content: file,
      visibility: "shared",
      metadata: parsed.metadata ?? {},
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      contentHash: "",
    },
  });
}

describe("the declared grouping definitions on the entity store", () => {
  test("imports, updates and reimports a document that needs repair as the class did", async () => {
    const opened = await store();
    await importFile(opened, valid);
    expect(await reads(opened)).toEqual(main.imported);

    const current = await opened.service.getEntity({
      entityType: type,
      id: type,
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing definitions");
    await opened.service.updateEntity({
      entity: {
        ...current,
        content: current.content.replace("Clients", "Customers"),
      },
    });
    expect(await reads(opened)).toEqual(main.updated);

    await importFile(opened, needsRepair);
    expect(await reads(opened)).toEqual(main.needsRepair);
  });
});
