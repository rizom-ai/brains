import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, ChatAttachment } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * An interface that already holds the bytes should not have to serve them
 * back to itself.
 *
 * The pipeline resolves an inbound attachment by fetching its URL, which is
 * right for a channel that only ever gets a link. web-chat receives uploads
 * directly and keeps them in its own store, so a URL would mean answering an
 * HTTP request from inside the turn that request started — through its own
 * auth gate, for bytes it is already holding.
 */

interface Receiver {
  receiveAuthenticated(input: {
    sender: { id: string };
    channel: { id: string };
    text: string;
    attachments?: () => Promise<
      readonly {
        name: string;
        mediaType: string;
        text?: string;
        source?: { kind: string; id: string };
      }[]
    >;
  }): Promise<void>;
}

const receivers: Receiver[] = [];

describe("an inbound attachment the interface already has", () => {
  it("reaches the agent without being fetched", async () => {
    receivers.length = 0;
    let seen: ChatAttachment[] | undefined;

    const definition = defineMessageInterface({
      id: "byte-holder",
      config: z.object({}),
      channel: {
        type: "byte-holder",
        displayName: "Byte Holder",
        subjectLabel: "Room",
        recipient: z.string(),
      },
      listen: async ({ messages, signal, health }) => {
        receivers.push(messages);
        health.ready();
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      send: async () => "message-1",
    });
    const [plugin] = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/byte-holder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Message interface plugin was not created");

    const harness = createPluginHarness();
    stubMethod(harness.getMockShell(), "getAgentService", () => ({
      chat: async (
        _text: string,
        _conversationId: string,
        context: { attachments?: ChatAttachment[] },
      ): Promise<AgentResponse> => {
        seen = context.attachments;
        return {
          text: "Got it.",
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
    await harness
      .getMockShell()
      .getDaemonRegistry()
      .start(`${plugin.id}:listener`);

    const receiver = receivers[0];
    if (!receiver) throw new Error("Listener did not expose its receiver");
    await receiver.receiveAuthenticated({
      sender: { id: "reader-1" },
      channel: { id: "room-1" },
      text: "what does this say?",
      // No URL: nothing here is reachable over HTTP, and nothing should try.
      attachments: async () => [
        {
          name: "note.txt",
          mediaType: "text/plain",
          text: "the bytes",
          // Where the interface put them, so the agent can reach them again.
          source: { kind: "upload", id: "upl_7" },
        },
      ],
    });

    expect(seen).toEqual([
      {
        kind: "text",
        filename: "note.txt",
        mediaType: "text/plain",
        content: "the bytes",
        sizeBytes: 9,
        source: { kind: "upload", id: "upl_7" },
      },
    ]);
  });
});
