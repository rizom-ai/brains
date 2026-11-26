import { describe, expect, it } from "bun:test";
import {
  buildNewsletterAtprotoRecord,
  newsletterAtproto,
} from "../src/entity/atproto-projection";

const entity: Parameters<typeof buildNewsletterAtprotoRecord>[0]["entity"] = {
  id: "issue-12",
  entityType: "newsletter",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  content: "Hello readers.\n\nThree essays this month.",
  metadata: {
    subject: "Issue 12: three essays",
    status: "published",
    sentAt: "2026-05-28T10:00:00.000Z",
  },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildNewsletterAtprotoRecord>[0]> = {},
): Parameters<typeof buildNewsletterAtprotoRecord>[0] {
  return {
    entity,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
      readBytes: async () => null,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("newsletter ATProto projection", () => {
  it("maps an issue to an ai.rizom.brain.newsletter record", async () => {
    const record = await buildNewsletterAtprotoRecord(
      recordInput({
        config: { brainDid: "did:web:brain.example.com" },
        pageUrl: "https://brain.example.com/newsletter/issue-12",
      }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.newsletter",
      title: "Issue 12: three essays",
      body: "Hello readers.\n\nThree essays this month.",
      format: "text/markdown",
      sentAt: "2026-05-28T10:00:00.000Z",
      canonicalUrl: "https://brain.example.com/newsletter/issue-12",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "newsletter",
      sourceEntityId: "issue-12",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("publishes an issue once it is sent, and never a draft or a queued one", () => {
    const publishable = (
      status: (typeof entity)["metadata"]["status"],
    ): boolean =>
      newsletterAtproto.isPublishable?.({
        ...entity,
        metadata: { ...entity.metadata, status },
      }) ?? true;

    expect(publishable("published")).toBe(true);
    expect(publishable("draft")).toBe(false);
    expect(publishable("queued")).toBe(false);
    expect(publishable("generating")).toBe(false);
    expect(publishable("failed")).toBe(false);
  });

  it("publishes under the canonical newsletter lexicon", () => {
    expect(newsletterAtproto.lexicon.id).toBe("ai.rizom.brain.newsletter");
  });
});
