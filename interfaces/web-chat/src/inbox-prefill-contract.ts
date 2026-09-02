import { inboxIdSchema, inboxItemIdSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface WebChatInboxContext {
  sourceId: string;
  itemId: string;
  label: string;
}

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

export const webChatInboxContextSchema: z.ZodType<
  WebChatInboxContext,
  WebChatInboxContext
> = z.strictObject({
  sourceId: inboxIdSchema,
  itemId: inboxItemIdSchema,
  label: safeText(160),
});

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
