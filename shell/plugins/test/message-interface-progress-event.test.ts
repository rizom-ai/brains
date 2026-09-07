import { describe, expect, it } from "bun:test";
import { JOB_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, MessageReceiver } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A channel that draws progress as a card, but keeps the runtime's
 * bookkeeping.
 *
 * `progress` hands an interface the event and takes the runtime out of it
 * entirely — right for a stream, where the client reconciles by id. chat is
 * the other case: Discord draws a progress card, and the runtime still has to
 * remember which message to edit when the job moves on, throttle those edits,
 * and hold completions until the answer has landed. So a progress-origin
 * message through `send` and `edit` carries the event it was rendered from,
 * and the interface draws what it likes from it.
 */

interface Sent {
  origin: "reply" | "progress";
  eventId: string | undefined;
  status: string | undefined;
}

async function drawer(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  messages: MessageReceiver;
  sent: Sent[];
  edits: { messageId: string; eventStatus: string | undefined }[];
}> {
  const sent: Sent[] = [];
  const edits: { messageId: string; eventStatus: string | undefined }[] = [];
  const receivers: MessageReceiver[] = [];
  const definition = defineMessageInterface(
    {
      id: "drawer",
      config: z.object({}),
      channel: {
        type: "drawer",
        displayName: "Drawer",
        subjectLabel: "Room",
        recipient: z.string(),
      },
    },
    {
      routes: ({ messages }) => {
        receivers.push(messages);
        return [];
      },
      send: ({ origin, event }) => {
        sent.push({ origin, eventId: event?.id, status: event?.status });
        return `sent-${sent.length}`;
      },
      edit: ({ messageId, event }) => {
        edits.push({ messageId, eventStatus: event?.status });
      },
    },
  );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/drawer", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (): Promise<AgentResponse> => ({
      text: "Sure.",
      cards: [],
      toolResults: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    invalidateAgent: (): void => {},
    confirmPendingAction: async (): Promise<AgentResponse> => {
      throw new Error("not reached");
    },
  }));
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();

  const messages = receivers[0];
  if (!messages) throw new Error("Routes were never asked for a receiver");
  return { harness, messages, sent, edits };
}

const progress = (
  status: "processing" | "completed",
): Record<string, unknown> => ({
  id: "job-1",
  type: "job",
  status,
  message: status === "processing" ? "Rendering" : "Rendered",
  ...(status === "processing"
    ? { progress: { current: 1, total: 2, percentage: 50 } }
    : {}),
  metadata: {
    operationType: "content_operations",
    rootJobId: "job-1",
    interfaceType: "drawer",
    channelId: "room-1",
    conversationId: "drawer:room-1",
  },
});

describe("a progress-origin message", () => {
  it("carries the event it was rendered from, to send and then to edit", async () => {
    const { harness, sent, edits } = await drawer();

    await harness.sendMessage(JOB_CHANNELS.progress, progress("processing"));
    await harness.sendMessage(JOB_CHANNELS.progress, progress("completed"));

    expect(sent).toEqual([
      { origin: "progress", eventId: "job-1", status: "processing" },
    ]);
    // The runtime remembered the message it sent and edits that one.
    expect(edits).toEqual([{ messageId: "sent-1", eventStatus: "completed" }]);
    await harness.reset();
  });

  it("carries no event behind a reply", async () => {
    const { harness, messages, sent } = await drawer();

    await messages.receiveAuthenticated({
      sender: { id: "user-1" },
      channel: { id: "room-1" },
      text: "hello",
    });

    expect(sent).toEqual([
      { origin: "reply", eventId: undefined, status: undefined },
    ]);
    await harness.reset();
  });
});
