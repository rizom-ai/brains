import {
  guestInterfaceType,
  guestExecutionPolicySchema,
  type GuestExecutionPolicy,
} from "@brains/contracts/chat";
import type { ModelMessage } from "ai";
import type { Tool } from "@brains/mcp-service";
import type { BrainCallOptions, ChatContext } from "./agent-types";

// Reviewed built-in retrieval only. A newly installed public tool is not guest authority.
const guestToolNames = new Set(["system_search", "system_get", "system_list"]);

export function isGuestToolAllowed(tool: Tool): boolean {
  return (
    guestToolNames.has(tool.name) &&
    tool.visibility === "public" &&
    tool.sideEffects === "none" &&
    tool.agentTool !== false
  );
}

export function assertGuestPermission(
  context: Pick<BrainCallOptions, "interfaceType" | "isAnchor"> &
    Pick<ChatContext, "userPermissionLevel">,
): void {
  if (
    context.interfaceType === guestInterfaceType &&
    ((context.userPermissionLevel ?? "public") !== "public" ||
      context.isAnchor === true)
  ) {
    throw new Error("Guest execution denied");
  }
}

export function requireGuestExecutionPolicy(
  context: Pick<BrainCallOptions, "interfaceType" | "guestExecution">,
): GuestExecutionPolicy | undefined {
  if (context.interfaceType !== guestInterfaceType) {
    if (context.guestExecution !== undefined)
      throw new Error("Guest execution scope mismatch");
    return undefined;
  }
  const parsed = guestExecutionPolicySchema.safeParse(context.guestExecution);
  if (!parsed.success) throw new Error("Guest execution limits required");
  return parsed.data;
}

/** Guest history is server-owned text, never system/tool instructions or remote files. */
export function guestModelMessages(
  messages: ModelMessage[] | undefined,
): ModelMessage[] {
  if (!messages) throw new Error("Guest execution denied");
  return messages.map((message) => {
    if (message.role !== "user" && message.role !== "assistant")
      throw new Error("Guest execution denied");
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((part) => {
              if (part.type !== "text")
                throw new Error("Guest execution denied");
              return part.text;
            })
            .join("\n");
    // Drop per-message/part provider options rather than forwarding opaque metadata.
    return { role: message.role, content };
  });
}

/** What a visitor on the brain's public site is here for. */
export const guestVisitorInstructions = `## Public Visitor
You are answering a visitor on this brain's public website. They came to explore this brain's work.
Answer from this brain's public content: search it before answering, including for general questions, and relate the answer to what the brain holds.
Cite what you found. When the brain holds nothing relevant, say so briefly before any general answer.
The visitor is not your anchor: speak of the anchor in the third person, as the person or organization behind this site, never as "your anchor".`;
