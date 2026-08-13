import { z } from "@brains/utils/zod";

export interface WebChatInboxPrefill {
  version: 1;
  text: string;
}

export interface WebChatInboxPrefillState {
  webChatPrefill: WebChatInboxPrefill;
}

export const webChatInboxPrefillSchema: z.ZodType<
  WebChatInboxPrefill,
  WebChatInboxPrefill
> = z.strictObject({
  version: z.literal(1),
  text: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => value.trim().length > 0)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)),
});

export const webChatInboxPrefillStateSchema: z.ZodType<
  WebChatInboxPrefillState,
  unknown
> = z.object({ webChatPrefill: webChatInboxPrefillSchema }).passthrough();

export function createWebChatInboxPrefillState(
  text: string,
): WebChatInboxPrefillState {
  return webChatInboxPrefillStateSchema.parse({
    webChatPrefill: { version: 1, text },
  });
}
