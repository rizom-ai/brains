import { z } from "@brains/utils/zod";
import { guestPolicySchema } from "./guest-policy";

type WebChatConfigSchema = z.ZodObject<{
  routePath: z.ZodDefault<z.ZodString>;
  apiPath: z.ZodDefault<z.ZodString>;
  guest: z.ZodDefault<typeof guestPolicySchema>;
}>;

export const webChatConfigSchema: WebChatConfigSchema = z.object({
  routePath: z.string().default("/ask"),
  apiPath: z.string().default("/api/chat"),
  guest: guestPolicySchema.default({ enabled: false }),
});

export type WebChatConfig = z.output<typeof webChatConfigSchema>;
export type WebChatConfigInput = z.input<typeof webChatConfigSchema>;
