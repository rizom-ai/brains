import { describe, expect, test } from "bun:test";
import {
  buildMessageMetadata,
  withMessageMetadata,
} from "../src/message-metadata";
import type { ConversationMessageActor } from "@brains/conversation-service";

const actor: ConversationMessageActor = {
  identity: { kind: "external", externalActorId: "actor-1" },
  interfaceType: "cli",
  role: "user",
  displayName: "Operator",
};

describe("buildMessageMetadata", () => {
  test("returns empty metadata when nothing is provided", async () => {
    expect(await buildMessageMetadata({ actor: null, source: null })).toEqual(
      {},
    );
  });

  test("records the permission level that governed a message", async () => {
    expect(
      await buildMessageMetadata({
        actor,
        source: null,
        userPermissionLevel: "trusted",
      }),
    ).toMatchObject({ userPermissionLevel: "trusted" });
  });

  test("enriches the actor through the canonical identity resolver", async () => {
    const metadata = await buildMessageMetadata({
      actor,
      source: null,
      canonicalIdentityResolver: {
        enrichActor: async (input: ConversationMessageActor) => ({
          ...input,
          identity: {
            kind: "user",
            userId: "usr_canonical_1",
            canonicalId: "canonical-1",
          },
        }),
      },
    });

    expect(metadata.actor).toMatchObject({
      identity: {
        kind: "user",
        userId: "usr_canonical_1",
        canonicalId: "canonical-1",
      },
    });
  });

  test("keeps the raw actor without a resolver and maps attachment metadata", async () => {
    const metadata = await buildMessageMetadata({
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
      entityMemoryRefs: [
        { entityType: "note", entityId: "note-1", operation: "updated" },
      ],
      agentContactCandidates: [
        { source: { kind: "url", url: "peer.example" } },
      ],
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
    expect(metadata.entityMemoryRefs).toEqual([
      { entityType: "note", entityId: "note-1", operation: "updated" },
    ]);
    expect(metadata.agentContactCandidates).toEqual([
      { source: { kind: "url", url: "peer.example" } },
    ]);
    expect(metadata).not.toHaveProperty("cards");
  });
});

describe("withMessageMetadata", () => {
  test("wraps non-empty metadata and drops empty metadata", () => {
    expect(withMessageMetadata({})).toEqual({});
    expect(
      withMessageMetadata({
        entityMemoryRefs: [
          { entityType: "note", entityId: "note-1", operation: "updated" },
        ],
      }),
    ).toEqual({
      metadata: {
        entityMemoryRefs: [
          { entityType: "note", entityId: "note-1", operation: "updated" },
        ],
      },
    });
  });
});
