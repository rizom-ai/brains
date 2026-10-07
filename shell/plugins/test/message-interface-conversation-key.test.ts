import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, MessageReceiver } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * An interface that already keyed its conversations one way keeps them.
 *
 * chat's Discord threads hold conversations keyed `discord-<thread>`, written
 * by the class it is being converted away from. The derived key would be
 * `discord:<thread>`, and every live thread would start over — its history,
 * and the approvals still pending in it, orphaned under the old key. The
 * declaration says how a channel becomes a conversation id, and the runtime
 * applies it everywhere it derives one.
 */

async function conversationIdsSeenBy(
  conversationKey: (channel: {
    id: string;
    threadId?: string | undefined;
  }) => string,
): Promise<{
  messages: MessageReceiver;
  conversationIds: string[];
  confirmed: string[];
}> {
  const conversationIds: string[] = [];
  const confirmed: string[] = [];
  const receivers: MessageReceiver[] = [];
  const definition = defineMessageInterface(
    {
      id: "legacy",
      config: z.object({}),
      channel: {
        type: "legacy",
        displayName: "Legacy",
        subjectLabel: "Thread",
        recipient: z.string(),
        conversationKey,
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
    { name: "@fixture/legacy", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  const answer: AgentResponse = {
    text: "Done.",
    cards: [],
    toolResults: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (
      _text: string,
      conversationId: string,
    ): Promise<AgentResponse> => {
      conversationIds.push(conversationId);
      return answer;
    },
    invalidateAgent: (): void => {},
    confirmPendingAction: async (
      conversationId: string,
    ): Promise<AgentResponse> => {
      confirmed.push(conversationId);
      return answer;
    },
  }));
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const messages = receivers[0];
  if (!messages) throw new Error("Routes were never asked for a receiver");
  return { messages, conversationIds, confirmed };
}

describe("an interface that says how a channel is keyed", () => {
  it("has every turn land in the conversation it names", async () => {
    const { messages, conversationIds } = await conversationIdsSeenBy(
      ({ id }) => `discord-${id}`,
    );

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "guild:channel:thread-9" },
      text: "hello",
    });

    // The key the class wrote, not `legacy:guild:channel:thread-9`.
    expect(conversationIds).toEqual(["discord-guild:channel:thread-9"]);
  });

  it("resolves an approval in that same conversation", async () => {
    const { messages, confirmed } = await conversationIdsSeenBy(
      ({ id }) => `discord-${id}`,
    );

    await messages.resolveApproval({
      sender: { id: "user-1" },
      channel: { id: "guild:channel:thread-9" },
      approvalId: "approval-1",
      approved: true,
    });

    expect(confirmed).toEqual(["discord-guild:channel:thread-9"]);
  });
});
