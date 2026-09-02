import {
  browserChatSourceContextSchema,
  type BrowserChatSourceContext,
} from "@brains/contracts/browser-chat";
import { z } from "@brains/utils/zod";

export type WebChatInboxContext = BrowserChatSourceContext;

export interface WebChatInboxPrefill {
  version: 2;
  text: string;
  context: WebChatInboxContext;
}

export interface WebChatInboxPrefillState {
  webChatPrefill: WebChatInboxPrefill;
}

const safeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export const webChatInboxContextSchema: typeof browserChatSourceContextSchema =
  browserChatSourceContextSchema;

export const webChatInboxPrefillSchema: z.ZodType<
  WebChatInboxPrefill,
  WebChatInboxPrefill
> = z.strictObject({
  version: z.literal(2),
  text: safeText(500),
  context: webChatInboxContextSchema,
});

export const webChatInboxPrefillStateSchema: z.ZodType<
  WebChatInboxPrefillState,
  unknown
> = z.object({ webChatPrefill: webChatInboxPrefillSchema }).passthrough();

export function createWebChatInboxPrefillState(
  text: string,
  context: WebChatInboxContext,
): WebChatInboxPrefillState {
  return webChatInboxPrefillStateSchema.parse({
    webChatPrefill: { version: 2, text, context },
  });
}
