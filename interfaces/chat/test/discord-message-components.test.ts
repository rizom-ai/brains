import { describe, it, expect } from "bun:test";
import {
  clearDiscordMessageComponents,
  type FetchLike,
} from "../src/discord-message-components";

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function createFetchStub(status: number): {
  calls: RecordedCall[];
  fetchFn: FetchLike;
} {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchLike = async (input, init): Promise<Response> => {
    calls.push({ url: String(input), init });
    return new Response(null, { status });
  };
  return { calls, fetchFn };
}

function createLogger(): {
  debugMessages: string[];
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
} {
  const debugMessages: string[] = [];
  return {
    debugMessages,
    logger: {
      debug: (message): void => {
        debugMessages.push(message);
      },
    },
  };
}

describe("clearDiscordMessageComponents", () => {
  it("patches the message with empty components using the thread part", async () => {
    const { calls, fetchFn } = createFetchStub(200);
    const { debugMessages, logger } = createLogger();

    await clearDiscordMessageComponents({
      threadId: "discord:guild-1:channel-1:thread-1",
      messageId: "msg-1",
      botToken: "token-1",
      logger,
      fetchFn,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe(
      "https://discord.com/api/v10/channels/thread-1/messages/msg-1",
    );
    expect(call?.init?.method).toBe("PATCH");
    expect(call?.init?.headers).toEqual({
      Authorization: "Bot token-1",
      "Content-Type": "application/json",
    });
    expect(call?.init?.body).toBe(JSON.stringify({ components: [] }));
    expect(debugMessages).toHaveLength(0);
  });

  it("falls back to the channel part when there is no thread part", async () => {
    const { calls, fetchFn } = createFetchStub(200);
    const { logger } = createLogger();

    await clearDiscordMessageComponents({
      threadId: "discord:guild-1:channel-1",
      messageId: "msg-1",
      botToken: "token-1",
      logger,
      fetchFn,
    });

    expect(calls[0]?.url).toBe(
      "https://discord.com/api/v10/channels/channel-1/messages/msg-1",
    );
  });

  it("does nothing for ids without a discord channel", async () => {
    const { calls, fetchFn } = createFetchStub(200);
    const { logger } = createLogger();

    await clearDiscordMessageComponents({
      threadId: "plain-id",
      messageId: "msg-1",
      botToken: "token-1",
      logger,
      fetchFn,
    });

    expect(calls).toHaveLength(0);
  });

  it("logs and swallows non-OK responses and thrown errors", async () => {
    const { fetchFn } = createFetchStub(404);
    const { debugMessages, logger } = createLogger();

    await clearDiscordMessageComponents({
      threadId: "discord:guild-1:channel-1",
      messageId: "msg-1",
      botToken: "token-1",
      logger,
      fetchFn,
    });
    expect(debugMessages).toHaveLength(1);

    const throwingFetch: FetchLike = async (): Promise<Response> => {
      throw new Error("network down");
    };
    await clearDiscordMessageComponents({
      threadId: "discord:guild-1:channel-1",
      messageId: "msg-1",
      botToken: "token-1",
      logger,
      fetchFn: throwingFetch,
    });
    expect(debugMessages).toHaveLength(2);
  });
});
