import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, ChatContext, MessageReceiver } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * The room a turn came from, named by the interface that knows it.
 *
 * The pipeline named every channel after the interface — "Discord" — because
 * that was all it had. A chat interface knows more: a DM is a DM, and a thread
 * belongs to a channel with an id. The name is recorded on the turn and on
 * the stored message, and a memory that says "in Discord" is not the memory
 * that says which room.
 */

async function turnsSeenBy(): Promise<{
  messages: MessageReceiver;
  contexts: (ChatContext | undefined)[];
}> {
  const contexts: (ChatContext | undefined)[] = [];
  const receivers: MessageReceiver[] = [];
  const definition = defineMessageInterface(
    {
      id: "rooms",
      config: z.object({}),
      channel: {
        type: "rooms",
        displayName: "Rooms",
        subjectLabel: "Room",
        recipient: z.string(),
      },
    },
    {
      routes: ({ messages }) => {
        receivers.push(messages);
        return [];
      },
    },
  );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/rooms", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (
      _text: string,
      _conversationId: string,
      context?: ChatContext,
    ): Promise<AgentResponse> => {
      contexts.push(context);
      return {
        text: "Done.",
        cards: [],
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    },
    invalidateAgent: (): void => {},
    confirmPendingAction: async (): Promise<AgentResponse> => {
      throw new Error("not reached");
    },
  }));
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const messages = receivers[0];
  if (!messages) throw new Error("Routes were never asked for a receiver");
  return { messages, contexts };
}

describe("a channel that names its room", () => {
  it("has the turn carry that name rather than the interface's", async () => {
    const { messages, contexts } = await turnsSeenBy();

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "guild:general:thread-3", name: "guild:general" },
      text: "hello",
      messageId: "m-1",
    });

    expect(contexts[0]?.channelName).toBe("guild:general");
    expect(contexts[0]?.source?.channelName).toBe("guild:general");
  });

  it("falls back to the interface's display name when it says nothing", async () => {
    const { messages, contexts } = await turnsSeenBy();

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      text: "hello",
    });

    expect(contexts[0]?.channelName).toBe("Rooms");
  });
});
