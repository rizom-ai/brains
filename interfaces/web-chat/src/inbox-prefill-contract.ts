import {
  chatSourceContextSchema,
  type ChatSourceContext,
} from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";

export type WebChatInboxContext = ChatSourceContext;

const safeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export const webChatInboxContextSchema: typeof chatSourceContextSchema =
  chatSourceContextSchema;

export const webChatInboxPrefillSchema: z.ZodObject<
  {
    version: z.ZodLiteral<2>;
    text: z.ZodString;
    context: typeof webChatInboxContextSchema;
  },
  z.core.$strict
> = z.strictObject({
  version: z.literal(2),
  text: safeText(500),
  context: webChatInboxContextSchema,
});

export type WebChatInboxPrefill = z.output<typeof webChatInboxPrefillSchema>;

export const webChatInboxPrefillStateSchema: z.ZodObject<
  { webChatPrefill: typeof webChatInboxPrefillSchema },
  z.core.$loose
> = z.looseObject({ webChatPrefill: webChatInboxPrefillSchema });

export type WebChatInboxPrefillState = z.output<
  typeof webChatInboxPrefillStateSchema
>;

export function createWebChatInboxPrefillState(
  text: string,
  context: WebChatInboxContext,
): WebChatInboxPrefillState {
  return webChatInboxPrefillStateSchema.parse({
    webChatPrefill: { version: 2, text, context },
  });
}
