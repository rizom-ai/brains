import { describe, expect, test } from "bun:test";
import {
  buildMessageMetadata,
  withMessageMetadata,
} from "../src/message-metadata";
import type { ConversationMessageActor } from "@brains/conversation-service";

const actor: ConversationMessageActor = {
  actorId: "actor-1",
  interfaceType: "cli",
  role: "user",
  displayName: "Operator",
};

describe("buildMessageMetadata", () => {
  test("returns empty metadata when nothing is provided", () => {
    expect(buildMessageMetadata({ actor: null, source: null })).toEqual({});
  });

  test("enriches the actor through the canonical identity resolver", () => {
    const metadata = buildMessageMetadata({
      actor,
      source: null,
      canonicalIdentityResolver: {
        enrichActor: (input: ConversationMessageActor) => ({
          ...input,
          canonicalId: "canonical-1",
        }),
      },
    });

    expect(metadata.actor).toMatchObject({
      actorId: "actor-1",
      canonicalId: "canonical-1",
    });
  });

  test("keeps the raw actor without a resolver and maps attachment metadata", () => {
    const metadata = buildMessageMetadata({
      actor,
      source: { channelId: "chan-1", channelName: "general" },
      attachments: [
        {
          kind: "text",
          filename: "notes.md",
          mediaType: "text/markdown",
          content: "hello",
          sizeBytes: 5,
          source: { kind: "upload", id: "upload-1" },
        },
      ],
      cards: [],
      entityMemoryNote: "note",
    });

    expect(metadata.actor).toEqual(actor);
    expect(metadata.source).toEqual({
      channelId: "chan-1",
      channelName: "general",
    });
    expect(metadata.attachments).toEqual([
      {
        kind: "text",
        filename: "notes.md",
        mediaType: "text/markdown",
        sizeBytes: 5,
        source: { kind: "upload", id: "upload-1" },
      },
    ]);
    expect(metadata.entityMemoryNote).toBe("note");
    expect(metadata).not.toHaveProperty("cards");
  });
});

describe("withMessageMetadata", () => {
  test("wraps non-empty metadata and drops empty metadata", () => {
    expect(withMessageMetadata({})).toEqual({});
    expect(withMessageMetadata({ entityMemoryNote: "note" })).toEqual({
      metadata: { entityMemoryNote: "note" },
    });
  });
});
