import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { stubMethod } from "@brains/test-utils";
import type { AgentResponse, ChatContext } from "../src";
import { createPluginHarness } from "../src/test/harness";
import {
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * An interface that already authenticated the caller says who they are.
 *
 * The pipeline resolves a sender's level from the configured permission rules,
 * which is right for a channel whose senders are just ids on someone else's
 * service. An interface holding a verified session has already answered the
 * question better: web-chat knows the signed-in principal, its level and
 * whether they are the brain's anchor. Re-deriving it from patterns would
 * downgrade every browser turn to public — no deployment configures a
 * `web-chat:*` rule — and re-attribute it to an external actor rather than
 * the person.
 *
 * This is not a new trust boundary. An interface is code inside the brain and
 * already passes a level straight to `agent.chat`; the slot names what was
 * being done anyway.
 */

interface Receiver {
  receiveAuthenticated(input: {
    sender: { id: string; displayName?: string };
    channel: { id: string };
    text: string;
    messageId?: string;
    caller?: {
      permissionLevel: "admin" | "trusted" | "public";
      isAnchor?: boolean;
      userId?: string;
      canonicalId?: string;
    };
  }): Promise<void>;
}

const receivers: Receiver[] = [];

async function turnContext(
  caller: Parameters<Receiver["receiveAuthenticated"]>[0]["caller"],
): Promise<ChatContext> {
  receivers.length = 0;
  let seen: ChatContext | undefined;

  const definition = defineMessageInterface({
    id: "session-holder",
    config: z.object({}),
    channel: {
      type: "session-holder",
      displayName: "Session Holder",
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
    { name: "@fixture/session-holder", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Message interface plugin was not created");

  const harness = createPluginHarness();
  stubMethod(harness.getMockShell(), "getAgentService", () => ({
    chat: async (
      _text: string,
      _conversationId: string,
      context?: ChatContext,
    ): Promise<AgentResponse> => {
      seen = context;
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
  await harness
    .getMockShell()
    .getDaemonRegistry()
    .start(`${plugin.id}:listener`);

  const receiver = receivers[0];
  if (!receiver) throw new Error("Listener did not expose its receiver");
  await receiver.receiveAuthenticated({
    sender: { id: "usr_mira", displayName: "Mira" },
    channel: { id: "room-1" },
    text: "publish the post",
    messageId: "msg_41",
    ...(caller ? { caller } : {}),
  });

  if (!seen) throw new Error("The agent was never asked");
  return seen;
}

describe("a turn from an interface that holds the session", () => {
  it("runs at the level the interface established", async () => {
    const context = await turnContext({
      permissionLevel: "admin",
      isAnchor: true,
      userId: "usr_mira",
      canonicalId: "user:mira",
    });

    expect(context.userPermissionLevel).toBe("admin");
    expect(context.isAnchor).toBe(true);
  });

  it("is attributed to the person, not an external stand-in", async () => {
    const context = await turnContext({
      permissionLevel: "admin",
      userId: "usr_mira",
      canonicalId: "user:mira",
    });

    expect(context.actor?.identity).toEqual({
      kind: "user",
      userId: "usr_mira",
      canonicalId: "user:mira",
    });
    expect(context.actor?.displayName).toBe("Mira");
    // The client already named this message; re-minting an id would lose the
    // one thing tying the stored turn to what the person is looking at.
    expect(context.source?.messageId).toBe("msg_41");
    // The declaration already says what this channel is called; a stored turn
    // showing only an opaque room id is the same information withheld.
    expect(context.channelName).toBe("Session Holder");
  });

  it("falls back to the configured rules when the interface says nothing", async () => {
    const context = await turnContext(undefined);

    // No rule matches this fixture, so the sender is a stranger — which is
    // exactly what a channel-shaped interface should get.
    expect(context.userPermissionLevel).toBe("public");
    expect(context.actor?.identity).toMatchObject({ kind: "external" });
  });
});
