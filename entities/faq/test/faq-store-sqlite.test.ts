import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { EntityService } from "@brains/entity-service";
import { internalFullScope, type ContentVisibility } from "@brains/plugins";
import { createTestEntityAccess } from "@brains/plugins/test";
import { createTestDirectory } from "@brains/test-utils";
import * as faqAdapter from "../src/lib/faq-content";
import { faqMetadata } from "../src/lib/faq-content";
import { captureOwnedFaq } from "../src/lib/owned-capture";
import { openFoldStorage } from "./helpers/fold-storage";
import {
  faqSchema,
  type FaqEntity,
  type FaqFrontmatter,
} from "../src/schemas/faq";

describe("FAQ merge retry eligibility with real SQLite", () => {
  let directory: Awaited<ReturnType<typeof createTestDirectory>>;
  let service: EntityService;

  beforeEach(async () => {
    directory = await createTestDirectory("faq-merge-eligibility");
    service = await openFoldStorage(directory.dir);
  });

  afterEach(async () => {
    service.close();
    await directory.cleanup();
  });

  async function read(): Promise<FaqEntity> {
    const entity = await service.getEntity(
      {
        entityType: "faq",
        id: "target",
        visibilityScope: internalFullScope("FAQ test fixture"),
      },
      faqSchema,
    );
    if (!entity) throw new Error("Missing FAQ test fixture");
    return entity;
  }

  async function seed(visibility: ContentVisibility): Promise<FaqEntity> {
    const fields: FaqFrontmatter = {
      question: "How do I publish?",
      status: "draft",
      asked: 1,
    };
    await service.createEntity({
      entity: {
        id: "target",
        entityType: "faq",
        visibility,
        content: faqAdapter.createFaqContent(fields, "Original answer"),
        metadata: faqMetadata(fields),
      },
    });
    return read();
  }

  async function edit(
    entity: FaqEntity,
    visibility: ContentVisibility,
    question = entity.metadata.question,
  ): Promise<FaqEntity> {
    const fields: FaqFrontmatter = { question, status: "published", asked: 2 };
    await service.updateEntity({
      entity: {
        ...entity,
        visibility,
        content: faqAdapter.createFaqContent(
          fields,
          "Separately reviewed answer",
        ),
        metadata: faqMetadata(fields),
      },
    });
    return read();
  }

  async function merge(entity: FaqEntity): Promise<boolean> {
    const { mutations } = createTestEntityAccess({
      entityService: service,
      ownedTypes: ["faq"],
      owner: "@brains/faq",
      declarationId: "capture",
    });
    const result = await captureOwnedFaq(
      {
        conversationId: "conversation",
        messageId: "reply",
        position: 2,
        userPermissionLevel:
          entity.visibility === "public"
            ? "public"
            : entity.visibility === "shared"
              ? "trusted"
              : "admin",
      },
      {
        mutations,
        wasClaimed: async () => false,
        messages: async () => [
          {
            id: "question",
            role: "user",
            content: entity.metadata.question,
            conversationId: "conversation",
            timestamp: "2026-09-01T00:00:00.000Z",
            metadata: {},
          },
          {
            id: "reply",
            role: "assistant",
            content: "PRIVATE_MERGE_TEST_MARKER",
            conversationId: "conversation",
            timestamp: "2026-09-01T00:00:01.000Z",
            metadata: {},
          },
        ],
        classify: async () => ({
          reusable: true,
          question: entity.metadata.question,
          answer: "PRIVATE_MERGE_TEST_MARKER",
        }),
        findSame: async () => entity,
      },
    );
    if (!result.captured) throw new Error("Expected captured answer");
    const destination = await service.getEntity(
      { entityType: "faq", id: result.entityId, visibilityScope: "restricted" },
      faqSchema,
    );
    expect(destination?.visibility).toBe(entity.visibility);
    if (!result.merged) expect(result.entityId).not.toBe(entity.id);
    return result.merged;
  }

  it.each([
    ["restricted", "public"],
    ["restricted", "shared"],
    ["public", "restricted"],
  ] as const)(
    "does not reapply %s material to a now-%s target",
    async (initial, changed) => {
      const original = await seed(initial);
      const edited = await edit(original, changed);
      expect(await merge(original)).toBe(false);
      expect(await read()).toEqual(edited);
      const publiclyReadable = await service.getEntity(
        {
          entityType: "faq",
          id: "target",
          visibilityScope: "public",
          publishedOnly: true,
        },
        faqSchema,
      );
      if (changed === "public") {
        expect(publiclyReadable).not.toBeNull();
        expect(publiclyReadable?.content).not.toContain(
          "PRIVATE_MERGE_TEST_MARKER",
        );
      } else {
        expect(publiclyReadable).toBeNull();
      }
    },
  );

  it("does not reapply an answer after the target question changes", async () => {
    const original = await seed("restricted");
    const edited = await edit(original, "restricted", "How do I unpublish?");
    expect(await merge(original)).toBe(false);
    expect(await read()).toEqual(edited);
  });

  it("still retries concurrent merges of the same question and visibility", async () => {
    const original = await seed("restricted");
    await edit(original, "restricted");
    expect(await merge(original)).toBe(true);
    const stored = await read();
    expect(stored.visibility).toBe("restricted");
    expect(stored.metadata.asked).toBe(3);
    expect(faqAdapter.parseFaqContent(stored.content)).toMatchObject({
      answer: "Separately reviewed answer",
      alternatives: [{ answer: "PRIVATE_MERGE_TEST_MARKER" }],
    });
  });
});
