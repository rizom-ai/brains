import { describe, expect, it } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
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

  it("normalizes legacy resolved users without retaining actorId", () => {
    const parsed = conversationMessageMetadataSchema.parse({
      actor: {
        actorId: "discord:123",
        userId: "usr_mira",
        canonicalId: "user:mira",
        interfaceType: "discord",
        role: "user",
      },
    });

    expect(parsed.actor).toEqual({
      identity: {
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      },
      interfaceType: "discord",
      role: "user",
    });
  });

  it("normalizes legacy external and assistant actors", () => {
    const external = conversationMessageMetadataSchema.parse({
      actor: {
        actorId: "discord:123",
        interfaceType: "discord",
        role: "user",
      },
    });
    const assistant = conversationMessageMetadataSchema.parse({
      actor: {
        actorId: "brain:relay",
        interfaceType: "agent",
        role: "assistant",
      },
    });

    expect(external.actor?.identity).toEqual({
      kind: "external",
      externalActorId: createExternalActorId("discord", "discord:123"),
    });
    expect(assistant.actor?.identity).toEqual({
      kind: "agent",
      agentId: "brain:relay",
    });
  });
});
