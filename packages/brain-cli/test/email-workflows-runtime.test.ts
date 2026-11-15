import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import emailWorkflowsPackage, {
  createMailItemProjection,
  emailReplyDraftAdapter,
  emailReplyDraftEntity,
  mailItemAdapter,
  withMailThreadOrdinal,
} from "@brains/email-workflows";
import { defineEntityPackage } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared mail-item and email-reply-draft on the brain's own entity
 * store, byte for byte as main's adapters stored them (the bytes in
 * fixtures/email-workflows-main-bytes.json were captured from those
 * adapters). A read hands back the whole document, as the class read it;
 * the header a mail item's metadata does not index stays in the file and
 * out of metadata.
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
    triaged: recordSchema,
    statusChanged: recordSchema,
    ordinal: recordSchema,
    createdWithOrdinal: recordSchema,
    retired: recordSchema,
    retiredRewrite: z.object({ rewritten: z.number() }),
    afterRetire: recordSchema,
    draft: recordSchema,
    sent: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "email-workflows-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const email = {
  messageId: "<m1@example.com>",
  sourceRef: "imap:opaque-1",
  threadId: "thread-1",
  from: { name: "Sender", address: "sender@example.com" },
  to: [{ name: "Smoke", address: "smoke@rizom.ai" }],
  subject: "A subject",
  receivedAt: "2026-04-15T09:00:00.000Z",
  text: "A body.",
  headers: {},
};
const classification = {
  decision: "retain" as const,
  title: "Advisory engagement",
  category: "opportunity" as const,
  priority: "high" as const,
  needsReply: true,
  organization: "Example Consulting",
  requestedActions: ["Review the timeline"],
  summary: "A prospect asks about an advisory engagement.",
};
const retiredFile =
  "---\ntitle: Old item\ncategory: work\npriority: normal\nstatus: new\nneedsReply: false\nreceivedAt: '2026-01-01T00:00:00.000Z'\nsource:\n  ref: imap:old\n  senderKey: sk-1\n  domain: example.com\nrequestedActions: []\n---\nAn older summary.\n";

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    emailWorkflowsPackage,
    "@brains/email-workflows",
    "email-workflows",
    {
      classification: "content",
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: ["source.senderKey", "source.domain"],
    },
    // The reply draft, which no brain installs on main, beside it.
    [
      defineEntityPackage({
        id: "email-reply-draft",
        entities: [emailReplyDraftEntity],
      }),
    ],
  );
  stores.push(opened);
  return opened;
}

async function reads(
  opened: DeclaredEntityStore,
  type: string,
  id: string,
): Promise<MainRecord> {
  const { service } = opened;
  const read = await service.getEntity({
    entityType: type,
    id,
    visibilityScope: "restricted",
  });
  const source = await service.getEntity({
    entityType: type,
    id,
    visibilityScope: "restricted",
    source: true,
  });
  const stored = await opened.stored(type, id);
  if (!read || !source || !stored) throw new Error(`Missing ${type}/${id}`);
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

describe("the declared mail item on the entity store", () => {
  test("stores triage, a status change and a thread ordinal as the class did", async () => {
    const opened = await store();
    const projection = createMailItemProjection(email, classification);
    await opened.service.createEntity({ entity: projection });
    expect(await reads(opened, "mail-item", projection.id)).toEqual(
      declared(main.triaged),
    );

    const current = await opened.service.getEntity({
      entityType: "mail-item",
      id: projection.id,
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing mail item");
    const parsed = mailItemAdapter.parseMailItemContent(current.content);
    await opened.service.updateEntity({
      entity: {
        ...current,
        content: mailItemAdapter.createMailItemContent(
          { ...parsed.frontmatter, status: "reviewed" },
          parsed.summary,
        ),
        metadata: { ...current.metadata, status: "reviewed" },
      },
    });
    expect(await reads(opened, "mail-item", projection.id)).toEqual(
      declared(main.statusChanged),
    );

    const again = await opened.service.getEntity({
      entityType: "mail-item",
      id: projection.id,
      visibilityScope: "restricted",
    });
    if (!again) throw new Error("Missing mail item");
    const p2 = mailItemAdapter.parseMailItemContent(again.content);
    const ordinalContent = mailItemAdapter.createMailItemContent(
      {
        ...p2.frontmatter,
        source: { ...p2.frontmatter.source, threadOrdinal: 1 },
      },
      p2.summary,
    );
    await opened.service.updateEntity({
      entity: {
        ...again,
        content: ordinalContent,
        metadata: mailItemAdapter.fromMarkdown(ordinalContent).metadata ?? {},
      },
    });
    expect(await reads(opened, "mail-item", projection.id)).toEqual(
      declared(main.ordinal),
    );

    const withOrdinal = withMailThreadOrdinal(
      createMailItemProjection(
        { ...email, messageId: "<m2@example.com>" },
        classification,
      ),
      2,
    );
    await opened.service.createEntity({ entity: withOrdinal });
    expect(await reads(opened, "mail-item", withOrdinal.id)).toEqual(
      declared(main.createdWithOrdinal),
    );
  });

  test("imports an older file and retires its source fields as the class did", async () => {
    const opened = await store();
    const parsed = opened.service.deserializeEntity(retiredFile, "mail-item");
    await opened.service.upsertEntity({
      entity: {
        ...parsed,
        id: "mail-old",
        entityType: "mail-item",
        content: retiredFile,
        visibility: "restricted",
        metadata: parsed.metadata ?? {},
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
        contentHash: "",
      },
    });
    expect(await reads(opened, "mail-item", "mail-old")).toEqual(
      declared(main.retired),
    );
    expect(await opened.service.rewriteRetiredFields()).toEqual(
      main.retiredRewrite,
    );
    expect(await reads(opened, "mail-item", "mail-old")).toEqual(
      declared(main.afterRetire),
    );
  });

  test("never writes the header twice: an import, a body update and the export round-trip", async () => {
    const opened = await store();
    const projection = createMailItemProjection(email, classification);
    await opened.service.createEntity({ entity: projection });
    const exported = (await reads(opened, "mail-item", projection.id)).exported;
    const reparsed = opened.service.deserializeEntity(exported, "mail-item");
    await opened.service.upsertEntity({
      entity: {
        ...reparsed,
        id: "mail-reimported",
        entityType: "mail-item",
        content: exported,
        visibility: "restricted",
        metadata: reparsed.metadata ?? {},
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
        contentHash: "",
      },
    });
    const reimported = await reads(opened, "mail-item", "mail-reimported");
    expect(reimported.stored.content).toBe(exported);
    expect(reimported.exported).toBe(exported);
    // One header: every key once.
    for (const key of ["title:", "source:", "senderLabel:", "visibility:"]) {
      expect(reimported.stored.content.split(key)).toHaveLength(2);
    }
  });

  test("keeps the sender and source details out of metadata", async () => {
    const opened = await store();
    const projection = createMailItemProjection(email, classification);
    await opened.service.createEntity({ entity: projection });
    const { read, stored } = await reads(opened, "mail-item", projection.id);
    for (const metadata of [read.metadata, JSON.parse(stored.metadata)]) {
      expect(Object.keys(metadata).sort()).toEqual([
        "category",
        "needsReply",
        "priority",
        "receivedAt",
        "status",
        "threadKey",
        "title",
      ]);
    }
    // An embedding and a full-text search read the stored record: the same
    // bytes main stored, so they read no more of the mail than main did.
    const embedded = await opened.service.getEntity({
      entityType: "mail-item",
      id: projection.id,
      visibilityScope: "restricted",
      source: true,
    });
    expect(embedded?.content).toBe(main.triaged.stored.content);
    // Nor anywhere in the metadata a search or an embedding reads.
    for (const detail of [
      "imap:opaque-1",
      "example.com",
      "Example Consulting",
      "Review the timeline",
    ]) {
      expect(stored.metadata).not.toContain(detail);
    }
  });
});

describe("the declared email reply draft on the entity store", () => {
  test("stores a draft and its sending as the class did", async () => {
    const opened = await store();
    const projection = createMailItemProjection(email, classification);
    const id = `draft-${projection.id}`;
    await opened.service.createEntity({
      entity: {
        id,
        entityType: "email-reply-draft",
        content: emailReplyDraftAdapter.createContent(
          { mailItemId: projection.id, revision: 1, status: "draft" },
          "Thanks, Tuesday works.",
        ),
        metadata: { mailItemId: projection.id, revision: 1, status: "draft" },
        visibility: "restricted",
        created: "2026-04-15T10:00:00.000Z",
        updated: "2026-04-15T10:00:00.000Z",
      },
    });
    expect(await reads(opened, "email-reply-draft", id)).toEqual(
      declared(main.draft),
    );

    const current = await opened.service.getEntity({
      entityType: "email-reply-draft",
      id,
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing draft");
    const sent = {
      mailItemId: projection.id,
      revision: 2,
      status: "sent" as const,
      sentAt: "2026-04-15T11:00:00.000Z",
      providerDeliveryId: "msg-1",
    };
    await opened.service.updateEntity({
      entity: {
        ...current,
        content: emailReplyDraftAdapter.createContent(
          sent,
          "Thanks, Tuesday works.",
        ),
        metadata: sent,
        updated: "2026-04-15T11:00:00.000Z",
      },
    });
    expect(await reads(opened, "email-reply-draft", id)).toEqual(
      declared(main.sent),
    );
  });
});
