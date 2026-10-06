import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createSqliteClient } from "@brains/db";
import { createTestDirectory } from "@brains/test-utils";
import { answerAskedBefore } from "../src/lib/asked-before";
import * as faqAdapter from "../src/lib/faq-content";
import { faqMetadata } from "../src/lib/faq-content";
import { faqAccess } from "./helpers/owned-access";
import { faqSchema } from "../src/schemas/faq";
import { openFoldStorage } from "./helpers/fold-storage";

describe("asked-before eligibility after confirmation (SQLite)", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let entities: Awaited<ReturnType<typeof openFoldStorage>>;
  const fields = {
    question: "How does memory work?",
    status: "published" as const,
    asked: 3,
  };
  beforeEach(async () => {
    directory = await createTestDirectory("faq-answer-race");
    entities = await openFoldStorage(directory.dir);
    entities.searchWithDistances = async (): ReturnType<
      typeof entities.searchWithDistances
    > => [{ entityType: "faq", entityId: "faq", distance: 0.1 }];
    await entities.createEntity({
      entity: {
        id: "faq",
        entityType: "faq",
        visibility: "public",
        content: faqAdapter.createFaqContent(fields, "Approved answer."),
        metadata: faqMetadata(fields),
      },
    });
  });
  afterEach(async () => {
    entities.close();
    await directory.cleanup();
  });

  it.each([
    "draft",
    "review",
    "restricted",
    "question",
    "answer",
    "metadata",
    "delete",
  ] as const)(
    "refuses a hit after %s changes while the generator confirms the old snapshot",
    async (change) => {
      const response = await answerAskedBefore(
        {
          entities: faqAccess(entities),
          sameQuestionDistance: 0.25,
          ai: {
            generateObject: async (_prompt, schema) => {
              const current = await entities.getEntity(
                { entityType: "faq", id: "faq" },
                faqSchema,
              );
              if (!current) throw new Error("Missing fixture");
              if (change === "delete") {
                await entities.deleteEntity({ entityType: "faq", id: "faq" });
              } else if (change === "metadata") {
                // An independent writer changes only canonical metadata, outside the
                // FAQ adapter's compact schema. The full revision must still notice.
                const db = createSqliteClient({
                  url: `file:${directory.dir}/entities.db`,
                });
                try {
                  await db.execute(
                    "UPDATE entities SET metadata = json_set(metadata, '$.reviewRace', 'changed') WHERE entityType = 'faq' AND id = 'faq'",
                  );
                } finally {
                  db.close();
                }
              } else {
                const next = {
                  ...fields,
                  ...(change === "draft" ? { status: "draft" as const } : {}),
                  ...(change === "review"
                    ? { review: "source-withdrawn" as const }
                    : {}),
                  ...(change === "question"
                    ? { question: "Another question?" }
                    : {}),
                };
                await entities.updateEntity({
                  entity: {
                    ...current,
                    visibility:
                      change === "restricted" ? "restricted" : "public",
                    content: faqAdapter.createFaqContent(
                      next,
                      change === "answer"
                        ? "Different answer."
                        : "Approved answer.",
                    ),
                    metadata: faqMetadata(next),
                  },
                });
              }
              return { object: schema.parse({ same: true }) };
            },
          },
        },
        { question: fields.question },
      );
      expect(response).toEqual({});
      const retained = await entities.getEntity(
        { entityType: "faq", id: "faq", visibilityScope: "restricted" },
        faqSchema,
      );
      if (change === "delete") expect(retained).toBeNull();
      else {
        expect(retained?.metadata.asked).toBe(3);
        if (change === "restricted")
          expect(retained?.visibility).toBe("restricted");
      }
    },
  );
});
