import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import analyticsPackage, {
  trafficSnapshotAdapter,
  type TrafficDay,
} from "@brains/analytics";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared traffic-snapshot on the brain's own entity store, byte for
 * byte as main's adapter stored it (the bytes in
 * fixtures/traffic-snapshot-main-bytes.json were captured from that
 * adapter). A read hands back the whole document, as the class read it;
 * the per-day numbers its header holds stay in the file and out of
 * metadata.
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
    firstDay: recordSchema,
    secondDay: recordSchema,
    retired: recordSchema,
    retiredRewrite: z.object({ rewritten: z.number() }),
    afterRetire: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "traffic-snapshot-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const day = (
  date: string,
  pageviews: number,
  estimated = false,
): TrafficDay => ({
  date,
  pageviews,
  visits: Math.round(pageviews / 2),
  estimated,
  paths: [{ path: "/", pageviews }],
  referrers: [{ host: "example.org", visits: 3 }],
  pathReferrers: [{ path: "/", host: "example.org", visits: 2 }],
  countries: [{ country: "NL", visits: 4 }],
});
const retiredFile =
  "---\nweek: 2026-W01\nstart: '2025-12-29'\nend: '2026-01-04'\ndays:\n  - date: '2025-12-29'\n    pageviews: 10\n    visits: 5\n    estimated: false\n    paths: []\n    referrers: []\n    pathReferrers: []\n    countries: []\n---\n# Traffic 2026-W01\n";

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    analyticsPackage,
    "@brains/analytics",
    "analytics",
    {
      classification: "system",
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
      embeddable: false,
      retiredFields: ["week", "start", "end"],
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
  );
  stores.push(opened);
  return opened;
}

async function reads(
  opened: DeclaredEntityStore,
  id: string,
): Promise<MainRecord> {
  const { service } = opened;
  const request = {
    entityType: "traffic-snapshot",
    id,
    visibilityScope: "restricted" as const,
  };
  const read = await service.getEntity(request);
  const source = await service.getEntity({ ...request, source: true });
  const stored = await opened.stored("traffic-snapshot", id);
  if (!read || !source || !stored) throw new Error(`Missing ${id}`);
  return {
    stored: { content: stored.content, metadata: stored.metadata },
    read: { content: read.content, metadata: read.metadata },
    exported: service.serializeEntity(source),
  };
}

/** What a read hands back on main, the whole document, without its visibility. */
function declared(record: MainRecord): MainRecord {
  return {
    ...record,
    read: {
      ...record.read,
      content: record.read.content.replace("visibility: restricted\n", ""),
    },
  };
}

/** A week saved as the capture saves it, through upsertEntity. */
async function save(
  opened: DeclaredEntityStore,
  days: TrafficDay[],
): Promise<void> {
  const frontmatter = { days };
  const content = trafficSnapshotAdapter.createContent(frontmatter);
  await opened.service.upsertEntity({
    entity: {
      id: "2026-W02",
      entityType: "traffic-snapshot",
      content,
      contentHash: computeContentHash(content),
      created: "2026-01-06T00:00:00.000Z",
      updated: "2026-01-06T00:00:00.000Z",
      visibility: "restricted",
      metadata: trafficSnapshotAdapter.metadataFor(frontmatter),
    },
  });
}

/** An exported file imported back, as directory sync imports one. */
async function importFile(
  opened: DeclaredEntityStore,
  id: string,
  file: string,
): Promise<void> {
  const parsed = opened.service.deserializeEntity(file, "traffic-snapshot");
  await opened.service.upsertEntity({
    entity: {
      ...parsed,
      id,
      entityType: "traffic-snapshot",
      content: file,
      visibility: "restricted",
      metadata: parsed.metadata ?? {},
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      contentHash: "",
    },
  });
}

describe("the declared traffic snapshot on the entity store", () => {
  test("stores a week's first day and the next as the class did", async () => {
    const opened = await store();
    await save(opened, [day("2026-01-05", 100)]);
    expect(await reads(opened, "2026-W02")).toEqual(declared(main.firstDay));

    await save(opened, [day("2026-01-05", 100), day("2026-01-06", 42, true)]);
    expect(await reads(opened, "2026-W02")).toEqual(declared(main.secondDay));
  });

  test("imports an older file and retires its week fields as the class did", async () => {
    const opened = await store();
    await importFile(opened, "2026-W01", retiredFile);
    expect(await reads(opened, "2026-W01")).toEqual(declared(main.retired));
    expect(await opened.service.rewriteRetiredFields()).toEqual(
      main.retiredRewrite,
    );
    expect(await reads(opened, "2026-W01")).toEqual(declared(main.afterRetire));
  });

  test("never writes the header twice: an import, a body update and the export round-trip", async () => {
    const opened = await store();
    await save(opened, [day("2026-01-05", 100), day("2026-01-06", 42, true)]);
    const { exported } = await reads(opened, "2026-W02");
    await importFile(opened, "2026-W02-reimported", exported);
    const reimported = await reads(opened, "2026-W02-reimported");
    expect(reimported.stored.content).toBe(exported);
    expect(reimported.exported).toBe(exported);

    // A body update keeps the header once, as it was.
    const current = await opened.service.getEntity({
      entityType: "traffic-snapshot",
      id: "2026-W02-reimported",
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing snapshot");
    await opened.service.updateEntity({
      entity: {
        ...current,
        content: current.content.replace("# Traffic", "# Site traffic"),
      },
    });
    const updated = await reads(opened, "2026-W02-reimported");
    expect(updated.exported).toBe(
      exported.replace("# Traffic", "# Site traffic"),
    );
    for (const key of ["days:", "visibility:", "- date: '2026-01-06'"]) {
      expect(updated.stored.content.split(key)).toHaveLength(2);
    }
  });

  test("keeps the per-day numbers out of metadata", async () => {
    const opened = await store();
    await save(opened, [day("2026-01-05", 100), day("2026-01-06", 42, true)]);
    const { read, stored } = await reads(opened, "2026-W02");
    for (const metadata of [read.metadata, JSON.parse(stored.metadata)]) {
      expect(metadata).toEqual({
        title: "Traffic 2026-W02",
        pageviews: 142,
        visits: 71,
      });
    }
    // Nor anywhere in the metadata a search or an embedding reads.
    for (const detail of ["days", "example.org", "NL", "2026-01-06"]) {
      expect(stored.metadata).not.toContain(detail);
    }
    // The days stay in the file, as main stored them.
    expect(stored.content).toBe(main.secondDay.stored.content);
  });
});
