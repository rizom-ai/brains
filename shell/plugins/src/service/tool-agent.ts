import { createHash } from "node:crypto";
import { actorRefKey, type ToolResultData } from "@brains/contracts";
import type { ToolContext } from "@brains/mcp-service";
import type { AgentNamespace, ChatContext } from "../contracts/agent";

/**
 * What the brain asked back, on its way to whoever called the tool.
 *
 * A tool returns this in place of its declared output. It is branded so the
 * runtime can tell an ask from data without the tool having to say which it
 * is returning, and every field on it is the runtime's — a tool forwards the
 * question, it does not compose one.
 */
export interface ToolAsk {
  readonly kind: "rizom-tool-ask";
  readonly approvalId: string;
  readonly toolName: string;
  readonly summary: string;
  readonly completionSummary: string | undefined;
  readonly preview: string | undefined;
  readonly toolCallId: string | undefined;
  readonly originalArgs: unknown;
  /** The handle the caller passed in, so the answer comes back to the same place. */
  readonly conversationId: string;
}

export function isToolAsk(value: unknown): value is ToolAsk {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "rizom-tool-ask"
  );
}

/**
 * What came back from the brain: an answer, or a question.
 *
 * `asked` is the discriminant on purpose — a tool that forgets to check it
 * would otherwise report an empty answer as a real one, which is the exact
 * failure this exists to prevent.
 */
export type ToolAgentAnswer =
  | {
      readonly asked?: undefined;
      readonly text: string;
      readonly toolResults: readonly ToolResultData[];
    }
  | { readonly asked: ToolAsk };

export interface ToolAgentChatInput {
  /**
   * An opaque handle naming the conversation to continue. The runtime scopes
   * it to the caller, so the same handle from two callers is two
   * conversations — a tool cannot read another caller's thread by guessing
   * its name.
   */
  readonly conversationId: string;
  readonly message: string;
  readonly signal?: AbortSignal | undefined;
}

export interface ToolAgentResolveInput {
  readonly conversationId: string;
  readonly approvalId: string;
  readonly confirmed: boolean;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The brain, as a tool reaches it.
 *
 * Narrower than the agent namespace an interface gets in `setup`: a tool
 * says what was said and in which conversation, and the runtime supplies who
 * is asking and what they may do — attribution is a fact about the caller,
 * not something a tool should be able to state about itself.
 */
export interface ToolAgent {
  chat(input: ToolAgentChatInput): Promise<ToolAgentAnswer>;
  resolve(input: ToolAgentResolveInput): Promise<ToolAgentAnswer>;
}

function scopeConversationId(
  pluginId: string,
  caller: ToolContext | undefined,
  handle: string,
): string {
  const key = caller ? actorRefKey(caller.actor) : "anonymous";
  const subject = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `${pluginId}:${subject}:${handle}`;
}

function chatContextFor(
  pluginId: string,
  caller: ToolContext | undefined,
): ChatContext {
  return {
    userPermissionLevel: caller?.userPermissionLevel ?? "public",
    isAnchor: caller?.isAnchor ?? false,
    interfaceType: pluginId,
    ...(caller?.channelId ? { channelId: caller.channelId } : {}),
    ...(caller?.channelName ? { channelName: caller.channelName } : {}),
    ...(caller
      ? {
          actor: {
            identity: caller.actor,
            interfaceType: pluginId,
            role: "user" as const,
            ...(caller.displayName ? { displayName: caller.displayName } : {}),
          },
        }
      : {}),
  };
}

function toAnswer(
  response: {
    readonly text: string;
    readonly toolResults?: readonly ToolResultData[] | undefined;
    readonly pendingConfirmations?:
      | readonly {
          readonly id: string;
          readonly toolName: string;
          readonly summary: string;
          readonly completionSummary?: string | undefined;
          readonly preview?: string | undefined;
          readonly toolCallId?: string | undefined;
          readonly args: unknown;
        }[]
      | undefined;
  },
  conversationId: string,
): ToolAgentAnswer {
  const pending = response.pendingConfirmations?.[0];
  if (pending) {
    return {
      asked: {
        kind: "rizom-tool-ask",
        approvalId: pending.id,
        toolName: pending.toolName,
        summary: pending.summary,
        completionSummary: pending.completionSummary,
        preview: pending.preview,
        toolCallId: pending.toolCallId,
        originalArgs: pending.args,
        conversationId,
      },
    };
  }
  return { text: response.text, toolResults: response.toolResults ?? [] };
}

/**
 * The brain as a tool reaches it, or a refusal explaining why it cannot.
 *
 * A tool the agent may call itself does not get the agent: the agent calling
 * a tool that calls the agent is a loop with no base case, and it is better
 * refused where it is written than discovered as a hung request. Declare
 * `agentTool: false` on a tool that *is* the way in — which is what such a
 * tool is doing anyway.
 */
export function createToolAgent(input: {
  readonly pluginId: string;
  readonly toolName: string;
  readonly agentTool: boolean;
  readonly agent: () => AgentNamespace | undefined;
  readonly caller: () => ToolContext | undefined;
}): ToolAgent {
  const reach = (): AgentNamespace => {
    if (input.agentTool) {
      throw new Error(
        `Tool "${input.toolName}" reaches the brain, so the agent must not be able to call it — declare agentTool: false.`,
      );
    }
    const agent = input.agent();
    if (!agent) {
      throw new Error(
        `Tool "${input.toolName}" reached the brain before it was available.`,
      );
    }
    return agent;
  };

  return {
    async chat(chat): Promise<ToolAgentAnswer> {
      const caller = input.caller();
      const conversationId = scopeConversationId(
        input.pluginId,
        caller,
        chat.conversationId,
      );
      const response = await reach().chat(
        chat.message,
        conversationId,
        chatContextFor(input.pluginId, caller),
        chat.signal,
      );
      return toAnswer(response, chat.conversationId);
    },
    async resolve(resolve): Promise<ToolAgentAnswer> {
      const caller = input.caller();
      const conversationId = scopeConversationId(
        input.pluginId,
        caller,
        resolve.conversationId,
      );
      const response = await reach().confirmPendingAction(
        conversationId,
        resolve.confirmed,
        resolve.approvalId,
        chatContextFor(input.pluginId, caller),
        resolve.signal,
      );
      return toAnswer(response, resolve.conversationId);
    },
  };
}
