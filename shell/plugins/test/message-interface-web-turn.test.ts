import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type {
  AgentResponse,
  ChatContext,
  MessageReceiver,
  ResponseRenderDirective,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A turn that arrived over HTTP, from a client that already knows what it is
 * answering.
 *
 * Both halves here are about an interface that mints its own session keys and
 * draws its own approval buttons — web-chat. Everything else the pipeline
 * does for a turn is the same, which is the reason to route it through at all.
 */

interface Harnessed {
  messages: MessageReceiver;
  presented: ResponseRenderDirective[][];
  conversationIds: string[];
  confirmations: {
    conversationId: string;
    approvalId: string;
    context?: ChatContext | undefined;
  }[];
}

async function webTurnHarness(options: {
  response?: AgentResponse;
  confirmResponse?: AgentResponse;
}): Promise<Harnessed> {
  const presented: ResponseRenderDirective[][] = [];
  const conversationIds: string[] = [];
  const confirmations: {
    conversationId: string;
    approvalId: string;
    context?: ChatContext | undefined;
  }[] = [];
  const receivers: MessageReceiver[] = [];

  const definition = defineMessageInterface(
    {
      id: "browser",
      config: z.object({}),
      channel: {
        type: "browser",
        displayName: "Browser",
        subjectLabel: "Conversation",
        recipient: z.string(),
        // This interface hands the client the id and gets it back next turn.
        conversationKey: "channel",
      },
    },
    {
      routes: ({ messages }) => {
        receivers.push(messages);
        return [];
      },
      present: ({ directives }) => {
        presented.push([...directives]);
        return undefined;
      },
      send: async () => "message-1",
    },
  );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/browser", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (
      _text: string,
      conversationId: string,
    ): Promise<AgentResponse> => {
      conversationIds.push(conversationId);
      return (
        options.response ?? {
          text: "Done.",
          cards: [],
          toolResults: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      );
    },
    invalidateAgent: (): void => {},
    confirmPendingAction: async (
      conversationId: string,
      _approved: boolean,
      approvalId: string,
      context?: ChatContext,
    ): Promise<AgentResponse> => {
      confirmations.push({ conversationId, approvalId, context });
      return (
        options.confirmResponse ?? {
          text: "Published.",
          cards: [
            {
              kind: "tool-approval",
              id: approvalId,
              toolName: "publish",
              summary: "Publish the post",
              state: "output-available",
              output: {},
            },
          ],
          toolResults: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      );
    },
  }));

  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const messages = receivers[0];
  if (!messages) throw new Error("Routes were never asked for a receiver");
  return { messages, presented, conversationIds, confirmations };
}

describe("an interface that keys its own conversations", () => {
  it("keeps the id it handed the client", async () => {
    const harnessed = await webTurnHarness({});

    await harnessed.messages.receiveAuthenticated({
      sender: { id: "usr_mira" },
      channel: { id: "web-2f9c" },
      text: "how is the post doing?",
      caller: { permissionLevel: "admin", userId: "usr_mira" },
    });

    // Not "browser:web-2f9c": the interface issued this key, the client holds
    // it, and prefixing it would open a second conversation beside the one
    // the caller was gated against.
    expect(harnessed.conversationIds).toEqual(["web-2f9c"]);
  });
});

describe("an approval the client names", () => {
  it("is resolved and presented without being spelled out as a sentence", async () => {
    const harnessed = await webTurnHarness({});

    const outcome = await harnessed.messages.resolveApproval({
      sender: { id: "usr_mira" },
      channel: { id: "web-2f9c" },
      approvalId: "approval-1",
      approved: true,
      caller: { permissionLevel: "admin", userId: "usr_mira" },
    });

    expect(outcome.kind).toBe("resolved");
    expect(harnessed.confirmations[0]).toMatchObject({
      conversationId: "web-2f9c",
      approvalId: "approval-1",
    });
    // Authorising an action is the person's act, and the record of it has to
    // say whose — the same attribution a turn carries.
    expect(harnessed.confirmations[0]?.context?.actor?.identity).toEqual({
      kind: "user",
      userId: "usr_mira",
    });
    expect(harnessed.confirmations[0]?.context?.channelId).toBe("web-2f9c");
    expect(harnessed.presented[0]?.[0]).toEqual({
      kind: "text",
      text: "Published.",
    });
  });

  it("reports one the brain is no longer holding, so the client can close it", async () => {
    const harnessed = await webTurnHarness({
      confirmResponse: {
        text: "That approval was already handled.",
        cards: [],
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    });

    const outcome = await harnessed.messages.resolveApproval({
      sender: { id: "usr_mira" },
      channel: { id: "web-2f9c" },
      approvalId: "approval-gone",
      approved: true,
      caller: { permissionLevel: "admin", userId: "usr_mira" },
    });

    // A client that draws an approval as a tool call keeps resubmitting until
    // that call reaches a terminal state, so "nothing happened" is not an
    // answer it can act on.
    expect(outcome).toEqual({
      kind: "not-pending",
      text: "That approval was already handled.",
    });
  });
});

describe("an interface asking what is still pending", () => {
  it("is told the approvals the runtime holds for that channel, and none once answered", async () => {
    const harnessed = await webTurnHarness({
      response: {
        text: "This will publish the post.",
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "publish",
            summary: "Publish the post",
            args: {},
          },
        ],
        cards: [],
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    });
    const channel = { id: "web-2f9c" };
    const sender = { id: "usr_mira" };

    expect(await harnessed.messages.pendingApprovals(channel)).toEqual([]);

    await harnessed.messages.receiveAuthenticated({
      sender,
      channel,
      text: "publish it",
    });
    // A button drawn for this approval is a live one.
    expect(await harnessed.messages.pendingApprovals(channel)).toEqual([
      "approval-1",
    ]);

    await harnessed.messages.resolveApproval({
      sender,
      channel,
      approvalId: "approval-1",
      approved: true,
    });
    // And a second click on it can be told so without spending a turn.
    expect(await harnessed.messages.pendingApprovals(channel)).toEqual([]);
  });
});
