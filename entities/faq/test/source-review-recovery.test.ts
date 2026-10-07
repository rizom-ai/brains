import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createTestDirectory, caughtError } from "@brains/test-utils";
import { EntityWriteConflictError } from "@brains/plugins";
import { createSqliteClient } from "@brains/db";
import { openFoldStorage } from "./helpers/fold-storage";
import { reviewFaqsCiting as reviewOwnedFaqsCiting } from "../src/lib/stale-sources";
import { faqAccess } from "./helpers/owned-access";
import * as faqAdapter from "../src/lib/faq-content";
import { faqMetadata } from "../src/lib/faq-content";
function reviewFaqsCiting(
  entities: Awaited<ReturnType<typeof openFoldStorage>>,
  sourceId: string,
  withdrawalId: string,
): Promise<string[]> {
  return reviewOwnedFaqsCiting(faqAccess(entities), sourceId, withdrawalId);
}
import { faqSchema, type FaqFrontmatter } from "../src/schemas/faq";

describe("durable source review decisions (SQLite)", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let entities: Awaited<ReturnType<typeof openFoldStorage>>;
  const sourceId = "network-piece:withdrawn";
  const fields: FaqFrontmatter = {
    question: "How?",
    status: "published",
    asked: 3,
    sources: [{ id: sourceId, title: "Source" }],
  };
  async function read(): Promise<
    NonNullable<Awaited<ReturnType<typeof entities.getEntity>>>
  > {
    const faq = await entities.getEntity(
      { entityType: "faq", id: "faq" },
      faqSchema,
    );
    if (!faq) throw new Error("Missing FAQ");
    return faq;
  }
  async function write(frontmatter: FaqFrontmatter): Promise<void> {
    await entities.updateEntity({
      entity: {
        ...(await read()),
        content: faqAdapter.createFaqContent(frontmatter, "Original answer."),
        metadata: faqMetadata(frontmatter),
      },
    });
  }
  beforeEach(async () => {
    directory = await createTestDirectory("faq-source-review");
    entities = await openFoldStorage(directory.dir);
    await entities.createEntity({
      entity: {
        entityType: "faq",
        id: "faq",
        visibility: "public",
        content: faqAdapter.createFaqContent(fields, "Original answer."),
        metadata: faqMetadata(fields),
      },
    });
  });
  afterEach(async () => {
    entities.close();
    await directory.cleanup();
  });

  it("preserves a metadata-only publication withdrawal instead of re-publishing from the body", async () => {
    const db = createSqliteClient({ url: `file:${directory.dir}/entities.db` });
    try {
      await db.execute(
        "UPDATE entities SET metadata = json_set(metadata, '$.status', 'draft') WHERE entityType = 'faq' AND id = 'faq'",
      );
    } finally {
      db.close();
    }
    expect(
      await reviewFaqsCiting(entities, sourceId, "withdrawal-job"),
    ).toEqual([]);
    expect((await read()).metadata["status"]).toBe("draft");
    expect(
      faqAdapter.parseFaqContent((await read()).content).frontmatter.review,
    ).toBeUndefined();
  });

  it("refreshes full revisions after an unrelated asking and preserves the increment", async () => {
    const commit = entities.applyEntityMutationOnce.bind(entities);
    const intercepted = spyOn(
      entities,
      "applyEntityMutationOnce",
    ).mockImplementationOnce(async (request) => {
      await write({ ...fields, asked: 4 });
      return commit(request);
    });
    expect(
      await reviewFaqsCiting(entities, sourceId, "withdrawal-job"),
    ).toEqual(["faq"]);
    expect(
      intercepted.mock.calls.map(([request]) => request.operation),
    ).toEqual(["update", "update", "none"]);
    const parsed = faqAdapter.parseFaqContent((await read()).content);
    expect(parsed.frontmatter).toMatchObject({
      asked: 4,
      review: "source-withdrawn",
      status: "published",
    });
    expect(parsed.answer).toBe("Original answer.");
  });

  it("throws on repeated conflicts, then resumes the same job after SQLite reopen", async () => {
    const intercepted = spyOn(
      entities,
      "applyEntityMutationOnce",
    ).mockImplementation(async () => {
      throw new EntityWriteConflictError("faq", "faq");
    });
    expect(
      caughtError(
        await reviewFaqsCiting(entities, sourceId, "withdrawal-job").catch(
          caughtError,
        ),
      ).message,
    ).toContain("kept changing during source review");
    expect(intercepted).toHaveBeenCalledTimes(3);
    intercepted.mockRestore();
    entities.close();
    entities = await openFoldStorage(directory.dir);
    expect(
      await reviewFaqsCiting(entities, sourceId, "withdrawal-job"),
    ).toEqual(["faq"]);
    expect(
      faqAdapter.parseFaqContent((await read()).content).frontmatter.review,
    ).toBe("source-withdrawn");
  });

  it("does not reflag an owner's later keep decision when an acknowledged write is replayed", async () => {
    expect(
      await reviewFaqsCiting(entities, sourceId, "withdrawal-job"),
    ).toEqual(["faq"]);
    await write(fields);
    entities.close();
    entities = await openFoldStorage(directory.dir);
    expect(
      await reviewFaqsCiting(entities, sourceId, "withdrawal-job"),
    ).toEqual([]);
    expect(
      faqAdapter.parseFaqContent((await read()).content).frontmatter.review,
    ).toBeUndefined();
    expect(
      await reviewFaqsCiting(entities, sourceId, "new-withdrawal-job"),
    ).toEqual(["faq"]);
  });
});
