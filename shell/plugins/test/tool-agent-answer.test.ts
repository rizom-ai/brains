import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineInterface,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What `@brains/mcp` needs that the tool surface could not say.
 *
 * mcp's way in is a tool that *is* the conversation: a client puts a message
 * to the brain and reads what comes back. Two things follow that no declared
 * tool could express. The brain has to be reachable from a tool's `execute`,
 * and the answer is not always data — the brain can ask something back, and
 * a client that never hears the question can never answer it.
 *
 * Both halves stay the runtime's. A tool says which conversation it is in
 * and what was said; the runtime supplies who is asking, scopes the thread
 * to them, and renders an ask the one way every protocol client already
 * understands.
 */

const noUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  config: unknown,
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(definition, config, {
    name: "@fixture/conversation-tool",
    version: "0.1.0",
  });
  if (!plugin) throw new Error("Interface plugin was not created");
  return plugin;
}

const conversationInterface = defineInterface({
  id: "conversation",
  config: z.object({}),
  tools: () => [
    defineTool({
      name: "chat",
      description: "Talk to the brain.",
      input: z.object({
        message: z.string().min(1),
        conversationId: z.string().min(1),
      }),
      output: z.object({ text: z.string(), conversationId: z.string() }),
      permission: "public",
      directMcpExposure: "basic",
      agentTool: false,
      execute: async ({ input, agent, signal }) => {
        const answer = await agent.chat({
          conversationId: input.conversationId,
          message: input.message,
          signal,
        });
        // The brain asked something back: hand the question on rather than
        // inventing an answer to it.
        if (answer.asked) return answer.asked;
        return { text: answer.text, conversationId: input.conversationId };
      },
    }),
    defineTool({
      name: "confirm",
      description: "Answer what the brain asked.",
      input: z.object({
        conversationId: z.string().min(1),
        approvalId: z.string().min(1),
        confirmed: z.boolean(),
      }),
      output: z.object({ text: z.string() }),
      permission: "public",
      directMcpExposure: "basic",
      agentTool: false,
      execute: async ({ input, agent, signal }) => {
        const answer = await agent.resolve({
          conversationId: input.conversationId,
          approvalId: input.approvalId,
          confirmed: input.confirmed,
          signal,
        });
        if (answer.asked) return answer.asked;
        return { text: answer.text };
      },
    }),
  ],
});

describe("a tool that is the conversation", () => {
  it("puts a message to the brain and answers with its text", async () => {
    const harness = createPluginHarness();
    const seen: Array<{ message: string }> = [];
    harness.setAgentService({
      chat: async (message) => {
        seen.push({ message });
        return { text: "The note is filed.", usage: noUsage };
      },
      confirmPendingAction: async () => ({ text: "", usage: noUsage }),
      invalidateAgent: (): void => {},
    });

    await harness.installPlugin(instantiate(conversationInterface, {}));

    expect(
      await harness.executeTool("conversation_chat", {
        message: "file this note",
        conversationId: "thread-1",
      }),
    ).toMatchObject({
      success: true,
      data: { text: "The note is filed.", conversationId: "thread-1" },
    });
    expect(seen).toEqual([{ message: "file this note" }]);
  });

  it("answers with the question when the brain asks one back", async () => {
    const harness = createPluginHarness();
    harness.setAgentService({
      chat: async () => ({
        text: "",
        usage: noUsage,
        pendingConfirmations: [
          {
            id: "approval-7",
            toolName: "note_delete",
            summary: "Delete the note 'Q3 plan'?",
            args: { id: "q3-plan" },
          },
        ],
      }),
      confirmPendingAction: async () => ({ text: "Deleted.", usage: noUsage }),
      invalidateAgent: (): void => {},
    });

    await harness.installPlugin(instantiate(conversationInterface, {}));

    // Not `{success: true, data: ...}`: an ask is not an answer, and a client
    // that reads it as one has silently dropped the question.
    expect(
      await harness.executeTool("conversation_chat", {
        message: "delete the Q3 plan",
        conversationId: "thread-2",
      }),
    ).toMatchObject({
      needsConfirmation: true,
      toolName: "note_delete",
      summary: "Delete the note 'Q3 plan'?",
      // The handle the caller passed, not the scoped thread id: it is what
      // they must send back, and the scoped form is not theirs to hold.
      args: { approvalId: "approval-7", conversationId: "thread-2" },
    });
  });

  it("carries the answer back to the brain and reports what it did", async () => {
    const harness = createPluginHarness();
    const resolved: Array<{ approvalId: string; confirmed: boolean }> = [];
    harness.setAgentService({
      chat: async () => ({ text: "", usage: noUsage }),
      confirmPendingAction: async (_conversationId, confirmed, approvalId) => {
        resolved.push({ approvalId, confirmed });
        return { text: "Deleted.", usage: noUsage };
      },
      invalidateAgent: (): void => {},
    });

    await harness.installPlugin(instantiate(conversationInterface, {}));

    expect(
      await harness.executeTool("conversation_confirm", {
        conversationId: "thread-2",
        approvalId: "approval-7",
        confirmed: true,
      }),
    ).toMatchObject({ success: true, data: { text: "Deleted." } });
    expect(resolved).toEqual([{ approvalId: "approval-7", confirmed: true }]);
  });

  it("keeps the tool's own confirmation gate separate from the brain's", async () => {
    // A tool can both ask for its own approval and forward one the brain
    // raised. They are different questions, and the gate must not answer
    // the one it did not ask.
    const harness = createPluginHarness();
    harness.setAgentService({
      chat: async () => ({ text: "ok", usage: noUsage }),
      confirmPendingAction: async () => ({ text: "", usage: noUsage }),
      invalidateAgent: (): void => {},
    });

    const gated = defineInterface({
      id: "gated",
      config: z.object({}),
      tools: () => [
        defineTool({
          name: "chat",
          description: "Talk to the brain, with a gate of its own.",
          input: z.object({ message: z.string().min(1) }),
          output: z.object({ text: z.string() }),
          permission: "public",
          agentTool: false,
          confirmation: "Send this to the brain?",
          execute: async ({ input, agent, signal }) => {
            const answer = await agent.chat({
              conversationId: "gated-thread",
              message: input.message,
              signal,
            });
            return answer.asked ?? { text: answer.text };
          },
        }),
      ],
    });

    await harness.installPlugin(instantiate(gated, {}));

    expect(
      await harness.executeTool("gated_chat", { message: "hi" }),
    ).toMatchObject({
      needsConfirmation: true,
      toolName: "gated_chat",
      summary: "Send this to the brain?",
    });
  });

  it("refuses the brain to a tool the brain can call", async () => {
    // Not a style rule: the agent calling a tool that calls the agent is a
    // loop with no base case. Refused where it is written, rather than found
    // as a request that never returns.
    const harness = createPluginHarness();
    harness.setAgentService({
      chat: async () => ({ text: "ok", usage: noUsage }),
      confirmPendingAction: async () => ({ text: "", usage: noUsage }),
      invalidateAgent: (): void => {},
    });

    const looping = defineInterface({
      id: "looping",
      config: z.object({}),
      tools: () => [
        defineTool({
          name: "chat",
          description: "Talk to the brain, without saying the agent may not.",
          input: z.object({ message: z.string().min(1) }),
          output: z.object({ text: z.string() }),
          permission: "public",
          execute: async ({ input, agent, signal }) => {
            const answer = await agent.chat({
              conversationId: "looping-thread",
              message: input.message,
              signal,
            });
            return answer.asked ?? { text: answer.text };
          },
        }),
      ],
    });

    await harness.installPlugin(instantiate(looping, {}));

    expect(
      await harness.executeTool("looping_chat", { message: "hi" }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("agentTool: false"),
    });
  });

  it("keeps one caller's conversation handle out of another's thread", async () => {
    // The handle is the caller's word, not an address. Two callers naming the
    // same thread must not land in the same conversation.
    const harness = createPluginHarness();
    const threads: string[] = [];
    harness.setAgentService({
      chat: async (_message, conversationId) => {
        threads.push(conversationId);
        return { text: "ok", usage: noUsage };
      },
      confirmPendingAction: async () => ({ text: "", usage: noUsage }),
      invalidateAgent: (): void => {},
    });

    await harness.installPlugin(instantiate(conversationInterface, {}));
    await harness.executeTool("conversation_chat", {
      message: "hello",
      conversationId: "shared",
    });

    const [scoped] = threads;
    expect(scoped).toBeDefined();
    // Scoped by the caller, with their own handle still in it so the thread
    // is findable from what they passed.
    expect(scoped).not.toBe("shared");
    expect(scoped).toContain("shared");
    expect(scoped).toStartWith("conversation:");
  });
});
