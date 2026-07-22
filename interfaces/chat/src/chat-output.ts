import type { MessageInterfaceOutput } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { CardElement } from "chat";
import { parseChatPlatform } from "./chat-platform";

export interface ChatCardOutput {
  card: CardElement;
  fallbackText?: string;
}

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

export function toChatCardOutput(
  output: MessageInterfaceOutput,
): ChatCardOutput | undefined {
  const parsed = chatCardOutputSchema.safeParse(output);
  if (!parsed.success) return undefined;

  const { card, fallbackText } = parsed.data;
  return fallbackText === undefined ? { card } : { card, fallbackText };
}

export function toPlatformPostOutput(
  channelId: string | null,
  output: MessageInterfaceOutput,
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

export function formatChatErrorPayload(error: unknown): MessageInterfaceOutput {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    card: {
      type: "card",
      title: "Message failed",
      children: [{ type: "text", content: message }],
    },
    fallbackText: `Message failed: ${message}`,
  };
}
