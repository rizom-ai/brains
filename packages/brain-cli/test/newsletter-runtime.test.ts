import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { markEntityPublished } from "@brains/content-pipeline";
import newsletterPackage, { newsletterEntity } from "@brains/newsletter";
import { generateMarkdownWithFrontmatter } from "@brains/plugins";
import { parseMarkdown } from "@brains/utils/markdown";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared newsletter on the brain's own entity store, byte for byte
 * as main's newsletter adapter stored it (the bytes in
 * fixtures/newsletter-main-bytes.json were captured from that adapter): a
 * generated issue, a hand-written one, one with the retired provider ids
 * and one with a key of its own as directory-sync imports them, the
 * retired-field rewrite, a publish through the pipeline and a body edit,
 * each with its stored row, its metadata and its export. An ordinary read
 * is the body alone, as every declared type's is.
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
    generated: recordSchema,
    imported: z.object({
      handWritten: recordSchema,
      retired: recordSchema,
      loose: recordSchema,
    }),
    retiredRewrite: z.object({ rewritten: z.number() }),
    afterRetire: recordSchema,
    published: recordSchema,
    edited: recordSchema,
    stub: z.object({
      content: z.string(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "newsletter-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const files = {
  handWritten:
    "---\nsubject: Field notes\nstatus: draft\nentityIds:\n  - post-1\n---\n\n# Field notes\n\nThis week.\n",
  retired:
    "---\nsubject: Sent issue\nstatus: published\nsentAt: '2026-01-02T00:00:00.000Z'\nbuttondownId: bd-1\nresendBroadcastId: rs-1\n---\nAlready sent.\n",
  loose: "---\nsubject: Loose\nstatus: draft\nnote: kept by hand\n---\nBody\n",
};

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    newsletterPackage,
    "@brains/newsletter",
    "newsletter",
    {
      classification: "content",
      projectionSourceRole: "secondary",
      publish: { publishStatuses: ["queued", "published", "failed"] },
      retiredFields: ["buttondownId", "resendBroadcastId"],
    },
  );
  stores.push(opened);
  return opened;
}

/** What main recorded for a record, its ordinary read the body alone. */
function declared(record: MainRecord): MainRecord {
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
): Promise<MainRecord> {
  const { service } = opened;
  const read = await service.getEntity({ entityType: "newsletter", id });
  const source = await service.getEntity({
    entityType: "newsletter",
    id,
    source: true,
  });
  const stored = await opened.stored("newsletter", id);
  if (!read || !source || !stored) throw new Error(`Missing ${id}`);
  return {
    stored: { content: stored.content, metadata: stored.metadata },
    read: { content: read.content, metadata: read.metadata },
    exported: service.serializeEntity(source),
  };
}

/** A file directory-sync imports, as the capture imported it. */
async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<void> {
  const parsed = opened.service.deserializeEntity(markdown, "newsletter");
  await opened.service.upsertEntity({
    entity: {
      ...parsed,
      id,
      entityType: "newsletter",
      content: markdown,
      visibility: "public",
      metadata: parsed.metadata ?? {},
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      contentHash: "",
    },
  });
}

const generatedMetadata = {
  subject: "Weekly digest",
  status: "draft",
  entityIds: ["post-1", "post-2"],
  sourceEntityType: "post",
};

async function generated(opened: DeclaredEntityStore): Promise<void> {
  // The generation hands the store the body; the class handed the whole
  // document, which the store reads back to the same row.
  await opened.service.createEntity({
    entity: {
      id: "weekly-digest",
      entityType: "newsletter",
      content: "# Weekly digest\n\nTwo posts.",
      metadata: generatedMetadata,
    },
  });
}

describe("the declared newsletter on the entity store", () => {
  test("allocates the stub the class's adapter built", () => {
    const stub = newsletterEntity.stub?.({
      id: "allocated",
      title: "Allocated",
    });
    expect(stub?.content).toBe(main.stub.content);
    expect({ ...stub?.metadata }).toEqual(main.stub.metadata);
  });

  test("stores a generated issue as the class did, and as the class's document does", async () => {
    const opened = await store();
    await generated(opened);
    expect(await reads(opened, "weekly-digest")).toEqual(
      declared(main.generated),
    );

    const fromDocument = await store();
    await fromDocument.service.createEntity({
      entity: {
        id: "weekly-digest",
        entityType: "newsletter",
        content: generateMarkdownWithFrontmatter(
          "# Weekly digest\n\nTwo posts.",
          generatedMetadata,
        ),
        metadata: generatedMetadata,
      },
    });
    expect(await reads(fromDocument, "weekly-digest")).toEqual(
      declared(main.generated),
    );
  });

  test("imports hand-written issues as the class did, and retires the provider ids", async () => {
    const opened = await store();
    await imported(opened, "field-notes", files.handWritten);
    await imported(opened, "sent-issue", files.retired);
    await imported(opened, "loose", files.loose);

    expect(await reads(opened, "field-notes")).toEqual(
      declared(main.imported.handWritten),
    );
    expect(await reads(opened, "sent-issue")).toEqual(
      declared(main.imported.retired),
    );
    expect(await reads(opened, "loose")).toEqual(declared(main.imported.loose));
    expect(await opened.service.rewriteRetiredFields()).toEqual(
      main.retiredRewrite,
    );
    expect(await reads(opened, "sent-issue")).toEqual(
      declared(main.afterRetire),
    );
  });

  test("stores a publish and a body edit as the class did", async () => {
    const opened = await store();
    await generated(opened);
    await imported(opened, "field-notes", files.handWritten);

    const draft = await opened.service.getEntity({
      entityType: "newsletter",
      id: "weekly-digest",
    });
    if (!draft) throw new Error("Missing weekly-digest");
    await markEntityPublished(
      { entityService: opened.service },
      draft,
      { id: "bd-2" },
      {
        publishedAt: "2026-02-01T00:00:00.000Z",
        publishTimestampField: "sentAt",
      },
    );
    expect(await reads(opened, "weekly-digest")).toEqual(
      declared(main.published),
    );

    const hand = await opened.service.getEntity({
      entityType: "newsletter",
      id: "field-notes",
    });
    if (!hand) throw new Error("Missing field-notes");
    await opened.service.updateEntity({
      entity: {
        ...hand,
        content: hand.content.replace("This week.", "This week, revised."),
      },
    });
    expect(await reads(opened, "field-notes")).toEqual(declared(main.edited));
  });
});
