import { expect, it } from "bun:test";
import { createTestDirectory, caughtError } from "@brains/test-utils";
import { answerAskedBefore } from "../src/lib/asked-before";
import * as faqAdapter from "../src/lib/faq-content";
import { faqMetadata } from "../src/lib/faq-content";
import { faqAccess } from "./helpers/owned-access";
import { faqSchema } from "../src/schemas/faq";
import { openCaptureStorage } from "./helpers/capture-storage";

it("counts a persisted asked-before reply once across capture replay and SQLite reopen", async () => {
  const directory = await createTestDirectory("asked-before-count");
  let classifications = 0;
  let fixture = await openCaptureStorage(directory.dir, {
    targetId: "faq",
    classify: async () => {
      classifications++;
    },
    replyMetadata: {
      askedBefore: { faqId: "faq" },
      faqCapture: { faqId: "faq", question: "What do you offer?" },
    },
  });
  try {
    const fields = {
      question: "What do you offer?",
      status: "published" as const,
      asked: 3,
    };
    await fixture.service.createEntity({
      entity: {
        id: "faq",
        entityType: "faq",
        visibility: "public",
        content: faqAdapter.createFaqContent(fields, "An example service."),
        metadata: faqMetadata(fields),
      },
    });
    const result = await answerAskedBefore(
      {
        entities: faqAccess(fixture.service),
        sameQuestionDistance: 0.2,
        ai: {
          generateObject: async (_prompt, schema) => ({
            object: schema.parse({ same: true }),
          }),
        },
      },
      { question: fields.question },
    );
    expect(result.hit?.faqId).toBe("faq");
    expect(
      (
        await fixture.service.getEntity(
          { entityType: "faq", id: "faq" },
          faqSchema,
        )
      )?.metadata.asked,
    ).toBe(3);
    expect(await fixture.process()).toMatchObject({
      captured: true,
      merged: true,
    });
    expect(classifications).toBe(0);
    fixture.close();
    fixture = await openCaptureStorage(directory.dir, { targetId: "faq" });
    expect(await fixture.process()).toMatchObject({
      captured: false,
      reason: "already-captured",
    });
    expect(
      (
        await fixture.service.getEntity(
          { entityType: "faq", id: "faq" },
          faqSchema,
        )
      )?.metadata.asked,
    ).toBe(4);
  } finally {
    fixture.close();
    await directory.cleanup();
  }
});

it("refuses an ambiguous older fast-path count without claiming or replaying it", async () => {
  const directory = await createTestDirectory("asked-before-legacy-count");
  const fixture = await openCaptureStorage(directory.dir, {
    targetId: "faq",
    replyMetadata: { askedBefore: { faqId: "faq" } },
    classify: async () => {
      throw new Error("Must not classify an ambiguous count");
    },
  });
  try {
    const fields = {
      question: "What do you offer?",
      status: "published" as const,
      asked: 4,
    };
    await fixture.service.createEntity({
      entity: {
        id: "faq",
        entityType: "faq",
        visibility: "public",
        content: faqAdapter.createFaqContent(fields, "An example service."),
        metadata: faqMetadata(fields),
      },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        caughtError(await fixture.process().catch(caughtError)).message,
      ).toContain("requires manual reconciliation");
    }
    expect(
      (
        await fixture.service.getEntity(
          { entityType: "faq", id: "faq" },
          faqSchema,
        )
      )?.metadata.asked,
    ).toBe(4);
    expect(
      await fixture.service.getEntityMutationReceipt({
        namespace: "faq.capture",
        key: "reply",
      }),
    ).toBeNull();
    expect(await fixture.replies.has("reply")).toBe(false);
  } finally {
    fixture.close();
    await directory.cleanup();
  }
});
