import { describe, it, expect, mock } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  MockChatSdk,
  authState,
  createMessage,
  createPlugin,
  createThread,
  discordExternalIdentity,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface identity and permissions", () => {
  const suite = setupChatInterfaceTest();

  it("uses linked auth principal permissions for Discord users", async () => {
    authState.resolveIdentityAccess = mock(async () => ({
      state: "resolved" as const,
      principal: {
        userId: "usr_mira",
        personId: "per_mira",
        displayName: "Mira",
        role: "trusted" as const,
        status: "active" as const,
        permissionLevel: "trusted" as const,
        isAnchor: true,
        canonicalId: "user:mira",
      },
    }));
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    expect(authState.resolveIdentityAccess).toHaveBeenCalledWith({
      type: "discord",
      subject: "user-789",
    });
    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello bot",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        userPermissionLevel: "trusted",
        isAnchor: true,
        actor: expect.objectContaining({
          identity: {
            kind: "user",
            userId: "usr_mira",
            canonicalId: "user:mira",
          },
          displayName: "Mira",
        }),
      }),
    );
  });

  it("lets a connected account override standalone config grants", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        admins: ["discord:user-789"],
        anchors: ["discord:user-789"],
      }),
    );
    authState.resolveIdentityAccess = mock(async () => ({
      state: "resolved" as const,
      principal: {
        userId: "usr_member",
        personId: "per_member",
        displayName: "Member",
        role: "public" as const,
        status: "active" as const,
        permissionLevel: "public" as const,
        isAnchor: false,
      },
    }));
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = suite.agentService.chat.mock.calls[0]?.[2];
    expect(context?.userPermissionLevel).toBe("public");
    expect(context?.isAnchor).toBe(false);
  });

  it("denies known inactive bindings before permission-rule fallback", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    authState.resolveIdentityAccess = mock(async () => ({
      state: "denied" as const,
    }));
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = suite.agentService.chat.mock.calls[0]?.[2];
    expect(context?.userPermissionLevel).toBe("public");
  });

  it("uses a config-seeded channel grant when no account is connected", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    authState.resolveIdentityAccess = mock(async () => ({
      state: "unbound" as const,
    }));
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = suite.agentService.chat.mock.calls[0]?.[2];
    expect(context?.userPermissionLevel).toBe("trusted");
    expect(context?.actor).toMatchObject({ identity: discordExternalIdentity });
  });

  it("propagates configured Anchor identity independently from permission", async () => {
    suite.harness.setPermissionService(
      new PermissionService({ anchors: ["discord:user-789"] }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(createThread(), createMessage());

    const context = suite.agentService.chat.mock.calls[0]?.[2];
    expect(context?.userPermissionLevel).toBe("public");
    expect(context?.isAnchor).toBe(true);
  });
});
