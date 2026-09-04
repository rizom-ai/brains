import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `chat-repl`, `chat`, `web-chat` and `mcp` each hand-roll.
 *
 * The pipeline sent `response.text` and nothing else, so a declared
 * interface dropped confirmations entirely: someone replying "yes" to a
 * pending approval was answered as if it were a new question. Tracking and
 * routing belong to the pipeline; how an approval reads is the interface's,
 * because a terminal and a web client legitimately differ.
 */

interface Receiver {
  receiveAuthenticated(input: {
    sender: { id: string; displayName?: string };
    channel: { id: string; threadId?: string };
    text: string;
  }): Promise<void>;
}

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/talkback", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");
  return plugin;
}

/**
 * An interface that answers, and says how an approval reads.
 *
 * `present` is given the directives the runtime already builds; this one
 * renders approvals the way a terminal would, with the reply that resolves
 * each one spelled out.
 */
function talkback(
  sent: string[],
  presented: string[],
): ReturnType<typeof defineMessageInterface> {
  return defineMessageInterface({
    id: "talkback",
    config: z.object({}),
    channel: {
      type: "talkback",
      displayName: "Talkback",
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
    send: async ({ message }) => {
      sent.push(message.text);
      return "message-1";
    },
    // A terminal numbers what it printed, so "yes 1" means the first of
    // them. Only this interface knows that, because only it did the
    // numbering.
    interpret: ({ text, approvalIds }) => {
      const match = /^(.*?)\s+#?(\d+)$/u.exec(text.trim());
      if (!match?.[1] || !match[2]) return text;
      const approvalId = approvalIds[Number(match[2]) - 1];
      return approvalId ? `${match[1]} ${approvalId}` : text;
    },
    // A terminal joins the whole answer into one block rather than sending
    // the text and then the approval as separate messages.
    present: ({ directives }) => {
      const blocks: string[] = [];
      for (const directive of directives) {
        if (directive.kind === "text") blocks.push(directive.text);
        if (directive.kind === "approvals") {
          for (const confirmation of directive.confirmations) {
            const prompt = `approve ${confirmation.id}? reply yes ${confirmation.id}`;
            presented.push(prompt);
            blocks.push(prompt);
          }
        }
      }
      return blocks.join("\n\n");
    },
  });
}

const receivers: Receiver[] = [];

describe("a declared interface that carries confirmations", () => {
  it("presents an approval instead of only the response text", async () => {
    receivers.length = 0;
    const sent: string[] = [];
    const presented: string[] = [];
    const harness = createPluginHarness();
    stubMethod(harness.getMockShell(), "getAgentService", () => ({
      chat: async (): Promise<AgentResponse> => ({
        text: "This will delete 3 notes.",
        pendingConfirmations: [
          {
            id: "appr-1",
            toolName: "system_delete",
            summary: "Delete 3 notes",
            args: {},
          },
        ],
        cards: [],
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
      invalidateAgent: (): void => {},
      confirmPendingAction: async (): Promise<AgentResponse> => {
        throw new Error("not reached");
      },
    }));

    const plugin = instantiate(talkback(sent, presented));
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
      text: "delete the old notes",
    });

    // One message, not two: the terminal coalesced the answer.
    expect(sent).toEqual([
      "This will delete 3 notes.\n\napprove appr-1? reply yes appr-1",
    ]);
    // Without this the approval never reaches anyone, and the next "yes"
    // has nothing to resolve.
    expect(presented).toEqual(["approve appr-1? reply yes appr-1"]);
  });

  it("routes a reply to the pending approval rather than the agent", async () => {
    receivers.length = 0;
    const sent: string[] = [];
    const presented: string[] = [];
    const asked: string[] = [];
    const confirmed: Array<{ approvalId: string; confirmed: boolean }> = [];
    const harness = createPluginHarness();
    stubMethod(harness.getMockShell(), "getAgentService", () => ({
      chat: async (message: string): Promise<AgentResponse> => {
        asked.push(message);
        return {
          text: "This will delete 3 notes.",
          pendingConfirmations: [
            {
              id: "appr-1",
              toolName: "system_delete",
              summary: "Delete 3 notes",
              args: {},
            },
          ],
          cards: [],
          toolResults: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
      invalidateAgent: (): void => {},
      confirmPendingAction: async (
        _conversationId: string,
        approved: boolean,
        approvalId: string,
      ): Promise<AgentResponse> => {
        confirmed.push({ approvalId, confirmed: approved });
        return {
          text: "Deleted.",
          pendingConfirmations: [],
          cards: [],
          toolResults: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
    }));

    const plugin = instantiate(talkback(sent, presented));
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
      text: "delete the old notes",
    });
    // The ordinal this interface printed, not the id — which only works
    // because it said what "1" meant.
    await receiver.receiveAuthenticated({
      sender: { id: "reader-1" },
      channel: { id: "room-1" },
      text: "yes 1",
    });

    // The reply resolved the approval; it was never put to the agent as a
    // new question.
    expect(asked).toEqual(["delete the old notes"]);
    expect(confirmed).toEqual([{ approvalId: "appr-1", confirmed: true }]);
    expect(sent).toContain("Deleted.");
  });
});
