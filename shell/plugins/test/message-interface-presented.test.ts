import { describe, expect, it } from "bun:test";
import { JOB_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type {
  AgentResponse,
  MessageReceiver,
  ResponseRenderDirective,
} from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * Two things a channel that posts cards and files needs from `present`.
 *
 * chat answers on Discord with a card, on Slack with compact text, and both
 * with the artifact's bytes attached — none of which survives being returned
 * as a string for `send` to post. So `present` may post the answer itself and
 * hand back the message id, and the runtime tracks that id for the jobs the
 * answer started, the way it tracks one it sent.
 *
 * And a confirmation outcome reads differently from an answer — chat titles
 * the card "Approved" or "Declined" and resolves the buttons it drew — so
 * `present` is told when the answer it is given resolves an approval.
 */

interface Presented {
  confirmation:
    | { approvalId: string; approved: boolean; remaining: readonly string[] }
    | undefined;
  directives: readonly ResponseRenderDirective[];
  permissionLevel: string;
}

async function poster(answer?: AgentResponse): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  messages: MessageReceiver;
  presented: Presented[];
  sent: string[];
  edits: { messageId: string; text: string }[];
}> {
  const presented: Presented[] = [];
  const sent: string[] = [];
  const edits: { messageId: string; text: string }[] = [];
  const receivers: MessageReceiver[] = [];
  const definition = defineMessageInterface({
    id: "poster",
    config: z.object({}),
    channel: {
      type: "poster",
      displayName: "Poster",
      subjectLabel: "Room",
      recipient: z.string(),
    },
    routes: ({ messages }) => {
      receivers.push(messages);
      return [];
    },
    // Posts the card itself and says which message it became.
    present: ({ directives, confirmation, permissionLevel }) => {
      presented.push({ confirmation, directives, permissionLevel });
      return { messageId: "posted-7" };
    },
    send: ({ message }) => {
      sent.push(message.text);
      return "sent-1";
    },
    edit: ({ messageId, message }) => {
      edits.push({ messageId, text: message.text });
    },
  });
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/poster", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  const answered: AgentResponse = {
    text: "Rendering the deck.",
    cards: [],
    toolResults: [{ toolName: "decks_render", jobId: "job-1" }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (): Promise<AgentResponse> => answer ?? answered,
    invalidateAgent: (): void => {},
    confirmPendingAction: async (
      _conversationId: string,
      _approved: boolean,
      approvalId: string,
    ): Promise<AgentResponse> => ({
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
    }),
  }));
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const messages = receivers[0];
  if (!messages) throw new Error("Routes were never asked for a receiver");
  return { harness, messages, presented, sent, edits };
}

describe("an interface that posts the answer itself", () => {
  it("has the runtime track its message for the jobs in the answer", async () => {
    const { harness, messages, sent, edits } = await poster();

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      text: "render the deck",
    });
    // Nothing went through `send`: the interface said it had posted.
    expect(sent).toEqual([]);

    await harness.sendMessage(JOB_CHANNELS.progress, {
      id: "job-1",
      type: "job",
      status: "completed",
      message: "Deck rendered",
      metadata: {
        operationType: "content_operations",
        rootJobId: "job-1",
        interfaceType: "poster",
        channelId: "room-1",
        conversationId: "poster:room-1",
      },
    });

    // The completion lands on the message the interface posted, not on a new
    // one and not nowhere.
    expect(edits.map((edit) => edit.messageId)).toEqual(["posted-7"]);
    await harness.reset();
  });

  it("tracks the job an artifact card is waiting on, not only a tool's", async () => {
    const { harness, messages, edits } = await poster({
      text: "Exporting the deck.",
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          jobId: "job-9",
          title: "Deck export",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-1",
            filename: "deck.pdf",
          },
        },
      ],
      toolResults: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      text: "export the deck",
    });
    await harness.sendMessage(JOB_CHANNELS.progress, {
      id: "job-9",
      type: "job",
      status: "completed",
      message: "Deck exported",
      metadata: {
        operationType: "content_operations",
        rootJobId: "job-9",
        interfaceType: "poster",
        channelId: "room-1",
        conversationId: "poster:room-1",
      },
    });

    expect(edits.map((edit) => edit.messageId)).toEqual(["posted-7"]);
    await harness.reset();
  });
});

describe("an interface told what it is presenting", () => {
  it("learns when the answer resolves an approval, and which way", async () => {
    const { harness, messages, presented } = await poster();

    await messages.resolveApproval({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      approvalId: "approval-1",
      approved: true,
    });

    expect(presented[0]?.confirmation).toEqual({
      approvalId: "approval-1",
      approved: true,
      // Nothing else was pending in this conversation.
      remaining: [],
    });
    await harness.reset();
  });

  it("is told nothing of the kind for an ordinary answer, and at what level it is shown", async () => {
    const { harness, messages, presented } = await poster();

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      text: "render the deck",
      caller: { permissionLevel: "trusted" },
    });

    expect(presented).toHaveLength(1);
    expect(presented[0]?.confirmation).toBeUndefined();
    // The level the runtime already denied artifacts against; a channel that
    // attaches bytes decides by the same one.
    expect(presented[0]?.permissionLevel).toBe("trusted");
    await harness.reset();
  });
});
