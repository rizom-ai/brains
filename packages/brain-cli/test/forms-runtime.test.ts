import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  contactRequestEntity,
  contactRequestSchema,
  contactRequestTarget,
} from "@brains/contact";
import {
  quizResultAdapter,
  quizResultEntity,
  quizResultSchema,
  quizResultTarget,
  type QuizResultFrontmatter,
} from "@brains/quiz";
import {
  defineEntityPackage,
  type BaseEntity,
  type EntitySchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared contact-request and quiz-result on the brain's own entity
 * store, byte for byte as main's adapters stored them (the bytes in
 * fixtures/forms-main-bytes.json were captured from those adapters). A
 * read hands back the whole document, as the classes read it; who wrote
 * in, what they answered and their results stay in the file and out of
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
    contactCreated: recordSchema,
    contactNotified: recordSchema,
    contactHandled: recordSchema,
    contactNoMessage: recordSchema,
    contactOlder: recordSchema,
    quizCreated: recordSchema,
    quizNotified: recordSchema,
    quizHandled: recordSchema,
    quizAnonymous: recordSchema,
    quizOlder: recordSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "forms-main-bytes.json"),
        "utf8",
      ),
    ),
  );

/** A record as the forms engine writes one, and a submission as it reads one. */
type FormRecord = ReturnType<typeof contactRequestTarget.record>;
type FormSubmission = Parameters<typeof contactRequestTarget.record>[0];

const typeConfig = {
  embeddable: false,
  fullTextSearchable: false,
  projectionSource: false,
  projectionSourceRole: "excluded" as const,
};
const olderContact =
  "---\nname: Old Sender\nemail: old@example.com\nreceivedAt: '2026-01-01T00:00:00.000Z'\nexpiresAt: '2026-01-02T00:00:00.000Z'\nstatus: new\nnotification: sent\n---\nAn older message.\n";
const olderQuiz =
  "---\nquiz: fit\nreceivedAt: '2026-01-01T00:00:00.000Z'\nstatus: new\nnotification: none\nresults:\n  - dimension: d\n    title: Fit\n    outcome: high\n    outcomeTitle: High fit\nanswers:\n  - field: q1\n    label: Question one\n    value: Yes\n---\n";

/** A submission as the contact target reads one: its answers and when. */
function contactSubmission(
  answers: Record<string, string>,
  receivedAt: string,
): FormSubmission {
  return z
    .custom<FormSubmission>()
    .parse({ answers, receivedAt: Date.parse(receivedAt) });
}

const quizFrontmatter: QuizResultFrontmatter = {
  quiz: "fit",
  quizTitle: "Fit check",
  language: "nl",
  receivedAt: "2026-04-15T09:00:00.000Z",
  status: "new",
  notification: "pending",
  name: "Bea Taker",
  email: "bea@example.com",
  results: [
    { dimension: "d", title: "Fit", outcome: "high", outcomeTitle: "High fit" },
  ],
  answers: [
    { field: "q1", label: "Question one", value: "Yes" },
    { field: "q2", label: "Pick some", value: ["A", "B"] },
  ],
};
const anonymousQuiz: QuizResultFrontmatter = {
  quiz: "fit",
  quizTitle: "Fit check",
  receivedAt: "2026-04-16T09:00:00.000Z",
  status: "new",
  notification: "none",
  results: [],
  answers: [],
};

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function contactStore(): Promise<DeclaredEntityStore> {
  // The declared type alone: the contact service around it serves forms
  // on a site, which a store of records does not need.
  const opened = await declaredEntityStore(
    defineEntityPackage({
      id: "contact-request",
      entities: [contactRequestEntity],
    }),
    "@brains/contact",
    "contact-request",
    typeConfig,
  );
  stores.push(opened);
  return opened;
}

async function quizStore(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    defineEntityPackage({ id: "quiz-result", entities: [quizResultEntity] }),
    "@brains/quiz",
    "quiz-result",
    typeConfig,
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
  const request = {
    entityType: type,
    id,
    visibilityScope: "restricted" as const,
  };
  const read = await service.getEntity(request);
  const source = await service.getEntity({ ...request, source: true });
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

/** A record written as the forms engine's intake writes one. */
async function create(
  opened: DeclaredEntityStore,
  type: string,
  id: string,
  record: FormRecord,
): Promise<void> {
  await opened.service.createEntity({
    entity: {
      id,
      entityType: type,
      visibility: "restricted",
      content: record.content,
      metadata: record.metadata,
    },
    options: { conditionalWrite: { expectedRevision: null } },
  });
}

/** A record changed as the engine changes one: read, then written back. */
async function change<E extends BaseEntity>(
  opened: DeclaredEntityStore,
  type: string,
  id: string,
  schema: EntitySchema<E>,
  next: (entity: E) => FormRecord,
): Promise<void> {
  const entity = await opened.service.getEntity(
    { entityType: type, id, visibilityScope: "restricted" },
    schema,
  );
  if (!entity) throw new Error(`Missing ${type}/${id}`);
  await opened.service.updateEntity({
    entity: { ...entity, ...next(entity) },
    options: { expectedContentHash: entity.contentHash },
  });
}

/** A file imported, as directory sync imports one. */
async function importFile(
  opened: DeclaredEntityStore,
  type: string,
  id: string,
  file: string,
): Promise<void> {
  const parsed = opened.service.deserializeEntity(file, type);
  await opened.service.upsertEntity({
    entity: {
      ...parsed,
      id,
      entityType: type,
      content: file,
      visibility: "restricted",
      metadata: parsed.metadata ?? {},
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      contentHash: "",
    },
  });
}

/** An export imported back, a body or header update, and the export again. */
async function roundTrip(
  opened: DeclaredEntityStore,
  type: string,
  id: string,
  update: (content: string) => string,
): Promise<{ exported: string; updated: MainRecord }> {
  const { exported } = await reads(opened, type, id);
  await importFile(opened, type, `${id}-again`, exported);
  const reimported = await reads(opened, type, `${id}-again`);
  expect(reimported.stored.content).toBe(exported);
  expect(reimported.exported).toBe(exported);
  const current = await opened.service.getEntity({
    entityType: type,
    id: `${id}-again`,
    visibilityScope: "restricted",
  });
  if (!current) throw new Error(`Missing ${type}/${id}-again`);
  await opened.service.updateEntity({
    entity: { ...current, content: update(current.content) },
  });
  return { exported, updated: await reads(opened, type, `${id}-again`) };
}

describe("the declared contact request on the entity store", () => {
  test("stores a request, its alert, its handling and an older file as the class did", async () => {
    const opened = await contactStore();
    await create(
      opened,
      "contact-request",
      "contact-1",
      contactRequestTarget.record(
        contactSubmission(
          {
            name: "Ada Sender",
            email: "ada@example.com",
            message: "Hello there.\n\nSecond paragraph.",
          },
          "2026-04-15T09:00:00.000Z",
        ),
      ),
    );
    expect(await reads(opened, "contact-request", "contact-1")).toEqual(
      declared(main.contactCreated),
    );
    await change(
      opened,
      "contact-request",
      "contact-1",
      contactRequestSchema,
      (entity) => contactRequestTarget.withNotification(entity, "sent"),
    );
    expect(await reads(opened, "contact-request", "contact-1")).toEqual(
      declared(main.contactNotified),
    );
    await change(
      opened,
      "contact-request",
      "contact-1",
      contactRequestSchema,
      (entity) => contactRequestTarget.inbox.withHandled(entity),
    );
    expect(await reads(opened, "contact-request", "contact-1")).toEqual(
      declared(main.contactHandled),
    );

    await create(
      opened,
      "contact-request",
      "contact-2",
      contactRequestTarget.record(
        contactSubmission(
          { name: "No Message", email: "none@example.com", message: "" },
          "2026-04-16T09:00:00.000Z",
        ),
      ),
    );
    expect(await reads(opened, "contact-request", "contact-2")).toEqual(
      declared(main.contactNoMessage),
    );

    await importFile(opened, "contact-request", "contact-old", olderContact);
    expect(await reads(opened, "contact-request", "contact-old")).toEqual(
      declared(main.contactOlder),
    );
  });

  test("never writes the header twice: an import, a body update and the export round-trip", async () => {
    const opened = await contactStore();
    await importFile(opened, "contact-request", "contact-old", olderContact);
    const { exported, updated } = await roundTrip(
      opened,
      "contact-request",
      "contact-old",
      (content) => content.replace("An older message.", "A newer message."),
    );
    expect(updated.exported).toBe(
      exported.replace("An older message.", "A newer message."),
    );
    for (const key of ["name:", "email:", "expiresAt:", "visibility:"]) {
      expect(updated.stored.content.split(key)).toHaveLength(2);
    }
  });

  test("keeps the name, email and message out of metadata", async () => {
    const opened = await contactStore();
    await create(
      opened,
      "contact-request",
      "contact-1",
      contactRequestTarget.record(
        contactSubmission(
          {
            name: "Ada Sender",
            email: "ada@example.com",
            message: "Hello there.",
          },
          "2026-04-15T09:00:00.000Z",
        ),
      ),
    );
    const { read, stored } = await reads(
      opened,
      "contact-request",
      "contact-1",
    );
    for (const metadata of [read.metadata, JSON.parse(stored.metadata)]) {
      expect(Object.keys(metadata).sort()).toEqual([
        "notification",
        "receivedAt",
        "status",
        "title",
      ]);
    }
    for (const detail of ["Ada Sender", "ada@example.com", "Hello there."]) {
      expect(stored.metadata).not.toContain(detail);
    }
  });
});

describe("the declared quiz result on the entity store", () => {
  test("stores a result, its alert, its handling, an anonymous one and an older file as the class did", async () => {
    const opened = await quizStore();
    await create(opened, "quiz-result", "fit-1", {
      content: quizResultAdapter.createContent(quizFrontmatter),
      metadata: quizResultAdapter.metadataFor(quizFrontmatter),
    });
    expect(await reads(opened, "quiz-result", "fit-1")).toEqual(
      declared(main.quizCreated),
    );
    await change(opened, "quiz-result", "fit-1", quizResultSchema, (entity) =>
      quizResultTarget.withNotification(entity, "sent"),
    );
    expect(await reads(opened, "quiz-result", "fit-1")).toEqual(
      declared(main.quizNotified),
    );
    await change(opened, "quiz-result", "fit-1", quizResultSchema, (entity) =>
      quizResultTarget.inbox.withHandled(entity),
    );
    expect(await reads(opened, "quiz-result", "fit-1")).toEqual(
      declared(main.quizHandled),
    );

    await create(opened, "quiz-result", "fit-2", {
      content: quizResultAdapter.createContent(anonymousQuiz),
      metadata: quizResultAdapter.metadataFor(anonymousQuiz),
    });
    expect(await reads(opened, "quiz-result", "fit-2")).toEqual(
      declared(main.quizAnonymous),
    );

    await importFile(opened, "quiz-result", "fit-old", olderQuiz);
    expect(await reads(opened, "quiz-result", "fit-old")).toEqual(
      declared(main.quizOlder),
    );
  });

  test("never writes the header twice: an import, a header update and the export round-trip", async () => {
    const opened = await quizStore();
    await create(opened, "quiz-result", "fit-1", {
      content: quizResultAdapter.createContent(quizFrontmatter),
      metadata: quizResultAdapter.metadataFor(quizFrontmatter),
    });
    const { exported, updated } = await roundTrip(
      opened,
      "quiz-result",
      "fit-1",
      (content) => content.replace("status: new", "status: handled"),
    );
    expect(updated.exported).toBe(
      exported.replace("status: new", "status: handled"),
    );
    for (const key of ["quiz:", "email:", "results:", "visibility:"]) {
      expect(updated.stored.content.split(key)).toHaveLength(2);
    }
  });

  test("keeps the taker's details, answers and results out of metadata", async () => {
    const opened = await quizStore();
    await create(opened, "quiz-result", "fit-1", {
      content: quizResultAdapter.createContent(quizFrontmatter),
      metadata: quizResultAdapter.metadataFor(quizFrontmatter),
    });
    const { read, stored } = await reads(opened, "quiz-result", "fit-1");
    for (const metadata of [read.metadata, JSON.parse(stored.metadata)]) {
      expect(metadata).toEqual({
        title: "Fit check",
        quiz: "fit",
        receivedAt: "2026-04-15T09:00:00.000Z",
        status: "new",
        notification: "pending",
        contact: true,
      });
    }
    for (const detail of [
      "Bea Taker",
      "bea@example.com",
      "Question one",
      "High fit",
    ]) {
      expect(stored.metadata).not.toContain(detail);
    }
  });
});
