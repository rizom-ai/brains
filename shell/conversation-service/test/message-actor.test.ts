import { describe, expect, it } from "bun:test";
import { conversationMessageMetadataSchema } from "../src/types";

describe("conversation message actors", () => {
  it("accepts the canonical ActorRef structure", () => {
    const parsed = conversationMessageMetadataSchema.parse({
      actor: {
        identity: {
          kind: "user",
          userId: "usr_mira",
          canonicalId: "user:mira",
        },
        interfaceType: "web-chat",
        role: "user",
        displayName: "Mira",
      },
    });

    expect(parsed.actor).toEqual({
      identity: {
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      },
      interfaceType: "web-chat",
      role: "user",
      displayName: "Mira",
    });
  });

  it.each([
    {
      actorId: "discord:123",
      userId: "usr_mira",
      canonicalId: "user:mira",
      interfaceType: "discord",
      role: "user",
    },
    { actorId: "discord:123", interfaceType: "discord", role: "user" },
    { actorId: "brain:relay", interfaceType: "agent", role: "assistant" },
  ])("refuses an actor stored as a bare actor id: %o", (actor) => {
    expect(conversationMessageMetadataSchema.safeParse({ actor }).success).toBe(
      false,
    );
  });
});
