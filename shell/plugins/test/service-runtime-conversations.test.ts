import { describe, expect, it } from "bun:test";
import type { IConversationService } from "@brains/conversation-service";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type Message,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class reads the brain's
 * conversations as its class read them through context.conversations: a
 * conversation's messages in the range it names, and how many it has.
 * Nothing that lists, searches or writes conversations.
 */

const reply: Message = {
  id: "m-2",
  conversationId: "c-1",
  role: "assistant",
  content: "An answer.",
  timestamp: "2026-01-01T00:00:00.000Z",
  metadata: {},
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
    expect(Object.keys(runtime.conversations).sort()).toEqual([
      "countMessages",
      "getMessages",
    ]);
  });
});
