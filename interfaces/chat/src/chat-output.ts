import { z } from "@brains/utils/zod";
import type { CardElement } from "chat";
import { parseChatPlatform } from "./chat-platform";
import { getErrorMessage } from "@brains/utils/error";

export interface ChatCardOutput {
  card: CardElement;
  fallbackText?: string;
}

/** What this interface posts: a Chat SDK card with its text fallback, or text. */
export type ChatOutput = ChatCardOutput | string;

const chatCardElementSchema = z.looseObject({
  type: z.literal("card"),
  children: z.array(z.looseObject({ type: z.string() })),
  imageUrl: z.string().optional(),
  subtitle: z.string().optional(),
  title: z.string().optional(),
});

const chatCardOutputSchema = z.object({
  card: z.custom<CardElement>(
    (value) => chatCardElementSchema.safeParse(value).success,
  ),
  fallbackText: z.string().optional(),
});

export function toChatCardOutput(output: unknown): ChatCardOutput | undefined {
  const parsed = chatCardOutputSchema.safeParse(output);
  if (!parsed.success) return undefined;

  const { card, fallbackText } = parsed.data;
  return fallbackText === undefined ? { card } : { card, fallbackText };
}

/**
 * How a card reads on this channel: Discord takes the card, Slack takes its
 * text fallback. Plain text is left to the caller to chunk and post.
 */
export function toPlatformPostOutput(
  channelId: string | null,
  output: ChatOutput,
): ChatCardOutput | string | undefined {
  if (typeof output === "string") return undefined;
  const cardOutput = toChatCardOutput(output);
  if (!cardOutput) return undefined;
  if (parseChatPlatform(channelId) === "slack" && cardOutput.fallbackText) {
    return cardOutput.fallbackText;
  }
  return cardOutput;
}

export function formatChatNoticePayload(
  message: string,
  title = "Approval notice",
): ChatCardOutput {
  return {
    card: {
      type: "card",
      title,
      children: [{ type: "text", content: message }],
    },
    fallbackText: message,
  };
}

export function formatChatErrorPayload(error: unknown): ChatCardOutput & {
  fallbackText: string;
} {
  const message = getErrorMessage(error, "Unknown error");
  return {
    card: {
      type: "card",
      title: "Message failed",
      children: [{ type: "text", content: message }],
    },
    fallbackText: `Message failed: ${message}`,
  };
}
