import { describe, expect, it } from "bun:test";
import { chatConfigFromEnv } from "../src/config-from-env";
import { chatConfigSchema } from "../src/config";
import { toPlatformPostOutput } from "../src/chat-output";
import { toPlatformText } from "../src/chat-platform";
import {
  getPermissionContext,
  isAllowedChannel,
  shouldRouteChatMessage,
} from "../src/discord-routing";
import {
  MockChatSdk,
  baseMatrixConfig,
  createChatPlugin,
  createMatrixAdapterMock,
  createMessage,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

const ROOM_ID = "!room:brain.example.com";
const ROOM_THREAD_ID = `matrix:${encodeURIComponent(ROOM_ID)}`;

describe("Matrix in the chat interface", () => {
  const suite = setupChatInterfaceTest();

  it("creates the Matrix adapter with the bot's password login", async () => {
    await suite.harness.installPlugin(
      createChatPlugin({ adapters: { matrix: baseMatrixConfig } }),
    );

    expect(createMatrixAdapterMock).toHaveBeenCalledWith({
      baseURL: "https://brain.example.com",
      auth: {
        type: "password",
        username: "_brain",
        password: "matrix-bot-password",
        userID: "@_brain:brain.example.com",
      },
      userName: "brain",
      inviteAutoJoin: { accept: expect.any(Function) },
      matrixSDKLogLevel: "warn",
    });
    expect(MockChatSdk.instances[0]?.config.adapters).toMatchObject({
      matrix: expect.objectContaining({ name: "matrix" }),
    });
    expect(
      suite.harness.getMockShell().getDaemonRegistry().getByPlugin("chat"),
    ).toHaveLength(1);
  });

  it("declines direct invites when DMs are off", async () => {
    await suite.harness.installPlugin(
      createChatPlugin({
        adapters: { matrix: { ...baseMatrixConfig, allowDMs: false } },
      }),
    );
    const accept =
      createMatrixAdapterMock.mock.calls[0]?.[0].inviteAutoJoin?.accept;

    expect(
      await accept?.({
        roomID: "!dm:brain.example.com",
        inviter: "@alice:other.example",
        isDirect: true,
      }),
    ).toBe(false);
  });

  it("starts the Chat SDK app, which starts Matrix sync, when the daemon starts", async () => {
    await suite.harness.installPlugin(
      createChatPlugin({ adapters: { matrix: baseMatrixConfig } }),
    );
    const daemon = suite.harness
      .getMockShell()
      .getDaemonRegistry()
      .getByPlugin("chat")[0];

    await daemon?.daemon.start();

    expect(MockChatSdk.instances[0]?.initialize).toHaveBeenCalledTimes(1);
    expect(await daemon?.daemon.healthCheck?.()).toMatchObject({
      status: "healthy",
    });
  });

  it("registers a matrix channel that delivers on its own", async () => {
    await suite.harness.installPlugin(
      createChatPlugin({ adapters: { matrix: baseMatrixConfig } }),
    );
    await suite.harness.finalizeRegistration();
    const channels = suite.harness.getMockShell().getChannelRegistry();

    expect(channels.listDescriptors()).toEqual([
      {
        type: "matrix",
        displayName: "Matrix",
        subjectLabel: "Matrix user ID",
        subjectPattern: {
          source: "^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(:[0-9]+)?$",
        },
      },
    ]);
    expect(channels.getDeliveryProvider("matrix")).toBeDefined();
  });

  it("delivers through the homeserver, in the worker too", async () => {
    const requests: string[] = [];
    const fetchFn = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      requests.push(
        `${init?.method ?? "GET"} ${decodeURIComponent(url.pathname)}`,
      );
      if (url.pathname.endsWith("/login")) {
        return Response.json({ access_token: "token" });
      }
      if (url.pathname.endsWith("/m.direct") && init?.method !== "PUT") {
        return Response.json({ errcode: "M_NOT_FOUND" }, { status: 404 });
      }
      if (url.pathname.endsWith("/createRoom")) {
        return Response.json({ room_id: "!dm:brain.example.com" });
      }
      if (url.pathname.includes("/send/")) {
        return Response.json({ event_id: "$sent" });
      }
      return Response.json({});
    };
    const plugin = createChatPlugin(
      { adapters: { matrix: baseMatrixConfig } },
      undefined,
      { fetch: fetchFn },
    );
    await plugin.registerChannelsForExecution(suite.harness.getMockShell(), {
      executionOnly: true,
    });
    const channels = suite.harness.getMockShell().getChannelRegistry();
    channels.finalize();
    const provider = channels.getDeliveryProvider("matrix");

    expect(await provider?.isAvailable()).toBe(true);
    expect(
      await provider?.send({
        recipient: "@alice:other.example",
        subject: "Your invitation",
        text: "Open the link.",
        idempotencyKey: "delivery-1",
      }),
    ).toEqual({ status: "sent", providerDeliveryId: "$sent" });
    expect(requests).toEqual([
      "POST /_matrix/client/v3/login",
      "GET /_matrix/client/v3/user/@_brain:brain.example.com/account_data/m.direct",
      "POST /_matrix/client/v3/createRoom",
      "PUT /_matrix/client/v3/user/@_brain:brain.example.com/account_data/m.direct",
      "PUT /_matrix/client/v3/rooms/!dm:brain.example.com/send/m.room.message/delivery-1",
    ]);
    expect(MockChatSdk.instances).toHaveLength(0);
  });

  it("routes a Matrix DM and replies with Markdown", async () => {
    await suite.harness.installPlugin(
      createChatPlugin({ adapters: { matrix: baseMatrixConfig } }),
    );
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: ROOM_THREAD_ID,
      channelId: ROOM_THREAD_ID,
      isDM: true,
      adapter: { name: "matrix" },
    });

    await chat?.handlers.directMessages[0]?.(
      thread,
      createMessage({ text: "Hello brain", isMention: false }),
      thread,
    );

    expect(suite.agentService.chat).toHaveBeenCalledWith(
      "Hello brain",
      `matrix-${ROOM_THREAD_ID}`,
      expect.objectContaining({
        interfaceType: "matrix",
        channelId: ROOM_THREAD_ID,
      }),
    );
    expect(thread.post).toHaveBeenCalledWith({
      markdown: "Agent response text.",
    });
  });
});

describe("Matrix senders", () => {
  it('routes a person the adapter cannot classify, which it reports as isBot "unknown"', () => {
    const thread = { ...createThreadLike(ROOM_THREAD_ID), isDM: true };
    const message = {
      author: { isMe: false, isBot: "unknown" },
      isMention: false,
      raw: {},
    };

    expect(
      shouldRouteChatMessage(thread, message, {
        allowedChannels: [],
        allowDMs: true,
      }),
    ).toBe(true);
    expect(getPermissionContext(thread, message)).toEqual({
      channelId: ROOM_ID,
      isBot: false,
    });
  });
});

describe("Matrix routing ids", () => {
  it("matches an allowed channel against the raw room id", () => {
    const thread = createThreadLike(`${ROOM_THREAD_ID}:%24root`);

    expect(isAllowedChannel(thread, { allowedChannels: [ROOM_ID] })).toBe(true);
    expect(
      isAllowedChannel(thread, {
        allowedChannels: ["!other:brain.example.com"],
      }),
    ).toBe(false);
  });

  it("uses the raw room id as the permission channel", () => {
    expect(
      getPermissionContext(createThreadLike(ROOM_THREAD_ID), {
        author: { isBot: false, isMe: false },
      }),
    ).toEqual({ channelId: ROOM_ID, isBot: false });
  });
});

describe("Matrix output", () => {
  it("sends text as Markdown and cards as their fallback text", () => {
    expect(toPlatformText(ROOM_THREAD_ID, "**hi**")).toEqual({
      markdown: "**hi**",
    });
    expect(
      toPlatformPostOutput(ROOM_THREAD_ID, {
        card: { type: "card", title: "Approval", children: [] },
        fallbackText: "Reply yes to confirm or no/cancel to abort.",
      }),
    ).toBe("Reply yes to confirm or no/cancel to abort.");
  });
});

describe("Matrix config", () => {
  it("accepts a brain whose only chat adapter is Matrix", () => {
    const parsed = chatConfigSchema.safeParse({
      adapters: {
        matrix: {
          baseUrl: "https://brain.example.com",
          userId: "@_brain:brain.example.com",
          password: "secret",
        },
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.adapters.matrix).toMatchObject({
      requireMention: true,
      allowDMs: true,
      allowedChannels: [],
    });
  });

  it("refuses a bot user id that is not a full Matrix id", () => {
    expect(
      chatConfigSchema.safeParse({
        adapters: {
          matrix: {
            baseUrl: "https://brain.example.com",
            userId: "_brain",
            password: "secret",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("wires Matrix from the environment when all three values are set", () => {
    expect(
      chatConfigFromEnv({
        MATRIX_BASE_URL: "https://brain.example.com",
        MATRIX_USER_ID: "@_brain:brain.example.com",
        MATRIX_PASSWORD: "secret",
      }),
    ).toEqual({
      adapters: {
        matrix: {
          baseUrl: "https://brain.example.com",
          userId: "@_brain:brain.example.com",
          password: "secret",
        },
      },
    });
    expect(
      chatConfigFromEnv({ MATRIX_BASE_URL: "https://brain.example.com" }),
    ).toEqual({});
  });

  it("wires Discord and Matrix together from the environment", () => {
    expect(
      chatConfigFromEnv({
        DISCORD_BOT_TOKEN: "t",
        DISCORD_PUBLIC_KEY: "k",
        DISCORD_APPLICATION_ID: "a",
        MATRIX_BASE_URL: "https://brain.example.com",
        MATRIX_USER_ID: "@_brain:brain.example.com",
        MATRIX_PASSWORD: "secret",
      }),
    ).toEqual({
      adapters: {
        discord: { botToken: "t", publicKey: "k", applicationId: "a" },
        matrix: {
          baseUrl: "https://brain.example.com",
          userId: "@_brain:brain.example.com",
          password: "secret",
        },
      },
    });
  });
});

function createThreadLike(id: string): {
  id: string;
  channelId: string;
  isDM: boolean;
} {
  return { id, channelId: ROOM_THREAD_ID, isDM: false };
}
