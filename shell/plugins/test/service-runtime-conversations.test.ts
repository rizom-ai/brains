import { describe, expect, it } from "bun:test";
import type { IConversationService } from "@brains/conversation-service";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type Conversation,
  type Message,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the brain's
 * conversations as its class read them through context.conversations: a
 * conversation, the conversations a listing names, a conversation's
 * messages in the range it names, and how many it has. Nothing that
 * searches or writes conversations.
 */

const reply: Message = {
  id: "m-2",
  conversationId: "c-1",
  role: "assistant",
  content: "An answer.",
  timestamp: "2026-01-01T00:00:00.000Z",
  metadata: {},
};

/** A conversation as the conversation service stores it. */
const stored = {
  id: "c-1",
  sessionId: "s-1",
  interfaceType: "discord",
  channelId: "chan-1",
  personId: null,
  started: "2026-01-01T00:00:00.000Z",
  lastActive: "2026-01-01T00:05:00.000Z",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:05:00.000Z",
  metadata: JSON.stringify({ channelName: "general" }),
};

/** The same conversation, as a class read it. */
const read: Conversation = {
  id: "c-1",
  sessionId: "s-1",
  interfaceType: "discord",
  channelId: "chan-1",
  channelName: "general",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T00:05:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:05:00.000Z",
  metadata: { channelName: "general" },
};

async function runtimeOn(
  conversations: Partial<IConversationService>,
): Promise<ServiceRuntime> {
  const shell = createMockShell();
  shell.setConversationService({
    ...shell.getConversationService(),
    ...conversations,
  });
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({ id: "probe", config: z.object({}) }),
      (context) => {
        runtime = serviceRuntime(context);
        return [];
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  await plugin?.register(shell);
  if (!runtime) throw new Error("The tools slot did not run");
  return runtime;
}

describe("a first-party service reading conversations as its class did", () => {
  it("reads a conversation's messages in the range asked, and counts them", async () => {
    const asked: unknown[] = [];
    const runtime = await runtimeOn({
      // Stored as the conversation service keeps it: metadata as JSON.
      getMessages: async (conversationId, options) => {
        asked.push({ conversationId, options });
        return [{ ...reply, metadata: JSON.stringify(reply.metadata) }];
      },
      countMessages: async (conversationId) =>
        conversationId === "c-1" ? 2 : 0,
    });

    expect(
      await runtime.conversations.getMessages("c-1", {
        range: { start: 1, end: 3 },
      }),
    ).toEqual([reply]);
    expect(asked).toEqual([
      { conversationId: "c-1", options: { range: { start: 1, end: 3 } } },
    ]);
    expect(await runtime.conversations.countMessages("c-1")).toBe(2);
  });

  it("reads one conversation, and none for an unknown id", async () => {
    const runtime = await runtimeOn({
      getConversation: async (conversationId) =>
        conversationId === "c-1" ? stored : null,
    });

    expect(await runtime.conversations.get("c-1")).toEqual(read);
    expect(await runtime.conversations.get("c-unknown")).toBeNull();
  });

  it("lists the conversations a listing names", async () => {
    const asked: unknown[] = [];
    const runtime = await runtimeOn({
      listConversations: async (options) => {
        asked.push(options);
        return [stored];
      },
    });

    expect(await runtime.conversations.list({ limit: 50 })).toEqual([read]);
    expect(asked).toEqual([{ limit: 50 }]);
  });

  it("offers nothing that searches or writes conversations", async () => {
    const runtime = await runtimeOn({});

    expect(Object.keys(runtime.conversations).sort()).toEqual([
      "countMessages",
      "get",
      "getMessages",
      "list",
    ]);
  });
});
