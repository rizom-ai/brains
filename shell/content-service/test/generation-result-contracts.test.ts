import { expect, test } from "bun:test";
import { contentGenerationResultSchema } from "../src/generation-result-contracts";

const destination = {
  entityType: "chapter",
  idPath: ["book", "intro"],
  entityId: "book:intro",
};
const planned = { destination, template: "chapter", status: "planned" };
const queued = { ...planned, status: "queued", jobId: "child-a" };
const skipped = {
  destination: {
    entityType: "summary",
    idPath: ["book", "summary"],
    entityId: "book:summary",
  },
  template: "summary",
  status: "skipped",
  reason: "content-exists",
};
const preview = {
  items: [skipped, planned],
  totalTargets: 2,
  plannedTargets: 1,
  queuedTargets: 0,
  skippedTargets: 1,
};
const admission = {
  ...preview,
  items: [skipped, queued],
  queuedTargets: 1,
  batchId: "batch-a",
};

test("submission schemas preserve correlation and distinguish preview from admission", () => {
  expect(contentGenerationResultSchema.safeParse(preview).success).toBe(true);
  expect(contentGenerationResultSchema.safeParse(admission).success).toBe(true);
  const parsed = contentGenerationResultSchema.parse(admission);
  for (const item of parsed.items)
    if (item.status === "queued") expect(item.jobId).toBe("child-a");
});

test("empty and all-skipped results carry no invented references", () => {
  expect(
    contentGenerationResultSchema.safeParse({
      items: [],
      totalTargets: 0,
      plannedTargets: 0,
      queuedTargets: 0,
      skippedTargets: 0,
    }).success,
  ).toBe(true);
  expect(
    contentGenerationResultSchema.safeParse({
      items: [skipped],
      totalTargets: 1,
      plannedTargets: 0,
      queuedTargets: 0,
      skippedTargets: 1,
    }).success,
  ).toBe(true);
  expect(
    contentGenerationResultSchema.safeParse({
      ...preview,
      batchId: "fake-preview",
    }).success,
  ).toBe(false);
  expect(
    contentGenerationResultSchema.safeParse({
      ...admission,
      batchId: undefined,
    }).success,
  ).toBe(false);
});

test("queued items require child references; previews and skips cannot claim them", () => {
  for (const item of [
    { ...queued, jobId: "" },
    planned,
    { ...planned, jobId: "fabricated" },
    { ...skipped, jobId: "fabricated" },
  ]) {
    expect(
      contentGenerationResultSchema.safeParse({
        ...admission,
        items: [skipped, item],
      }).success,
    ).toBe(false);
  }
});

test("invalid counts, mixed planned/queued decisions and duplicate destinations fail validation", () => {
  for (const value of [
    { ...admission, totalTargets: 99 },
    { ...admission, plannedTargets: 0 },
    { ...admission, queuedTargets: 2 },
    { ...admission, skippedTargets: 0 },
    {
      ...admission,
      items: [planned, queued],
      plannedTargets: 2,
      skippedTargets: 0,
    },
    {
      ...admission,
      items: [queued, { ...queued, jobId: "child-b" }],
      plannedTargets: 2,
      queuedTargets: 2,
      skippedTargets: 0,
    },
    {
      ...admission,
      items: [queued, { ...queued, destination: skipped.destination }],
      plannedTargets: 2,
      queuedTargets: 2,
      skippedTargets: 0,
    },
  ])
    expect(contentGenerationResultSchema.safeParse(value).success).toBe(false);
});

test("a destination's entity ID must be the encoding of its own path", () => {
  for (const value of [
    { ...destination, entityId: "book:elsewhere" },
    { ...destination, entityId: "book/intro" },
    { ...destination, idPath: ["book", "other"] },
  ])
    expect(
      contentGenerationResultSchema.safeParse({
        ...admission,
        items: [skipped, { ...queued, destination: value }],
      }).success,
    ).toBe(false);
});

test("submission cannot advertise output, context, metadata or authority", () => {
  for (const item of [
    { ...queued, output: { entityType: "chapter", entityId: "book:intro" } },
    { ...queued, context: { prompt: "private input" } },
    { ...queued, destination: { ...destination, metadata: {} } },
    { ...queued, status: "completed" },
    { ...skipped, reason: "unknown" },
  ])
    expect(
      contentGenerationResultSchema.safeParse({
        ...admission,
        items: [skipped, item],
      }).success,
    ).toBe(false);
  expect(
    contentGenerationResultSchema.safeParse({
      ...admission,
      authority: { actor: "forged" },
    }).success,
  ).toBe(false);
});
