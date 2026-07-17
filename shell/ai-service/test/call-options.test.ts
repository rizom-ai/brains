import { describe, expect, test } from "bun:test";
import { buildBrainCallOptions } from "../src/call-options";

describe("buildBrainCallOptions", () => {
  const base = {
    userPermissionLevel: "trusted" as const,
    conversationId: "conv-1",
    channelId: "chan-1",
    channelName: "general",
    interfaceType: "cli",
  };

  test("includes only typed base options when no uploads are accessible", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: false,
    });

    expect(options).toEqual({
      userPermissionLevel: "trusted",
      conversationId: "conv-1",
      channelId: "chan-1",
      channelName: "general",
      interfaceType: "cli",
    });
  });

  test("enables typed upload capabilities when uploads are accessible", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: true,
    });

    expect(options).toEqual({
      ...base,
      enableCreateUpload: true,
      enableCreateTransform: true,
    });
  });

  test("passes prior-response candidate availability through when present", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: true,
      hasPriorResponseCandidate: true,
    });

    expect(options.hasPriorResponseCandidate).toBe(true);
  });

  test("passes authenticated actor attribution through", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: false,
      actor: {
        identity: {
          kind: "user",
          userId: "usr_mira",
          canonicalId: "user:mira",
        },
        interfaceType: "discord",
        role: "user",
        displayName: "Mira",
      },
    });

    expect(options).toMatchObject({
      actor: {
        kind: "user",
        userId: "usr_mira",
        canonicalId: "user:mira",
      },
      displayName: "Mira",
    });
    expect(options).not.toHaveProperty("userId");
    expect(options).not.toHaveProperty("canonicalId");
  });

  test("does not flatten external actors into user ids", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: false,
      actor: {
        identity: { kind: "external", externalActorId: "ext_mira" },
        interfaceType: "discord",
        role: "user",
      },
    });

    expect(options).toMatchObject({
      actor: { kind: "external", externalActorId: "ext_mira" },
    });
    expect(options).not.toHaveProperty("userId");
  });

  test("passes agent context instructions through when present", () => {
    const options = buildBrainCallOptions({
      ...base,
      hasAccessibleUploads: false,
      agentContextInstructions: "context notes",
    });

    expect(options.agentContextInstructions).toBe("context notes");
  });
});
