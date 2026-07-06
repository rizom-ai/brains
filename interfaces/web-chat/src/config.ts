import { z } from "@brains/utils/zod-v4";

type WebChatConfigSchema = z.ZodObject<{
  routePath: z.ZodDefault<z.ZodString>;
  apiPath: z.ZodDefault<z.ZodString>;
}>;

export const webChatConfigSchema: WebChatConfigSchema = z.object({
  routePath: z.string().default("/chat"),
  apiPath: z.string().default("/api/chat"),
});

export type WebChatConfig = z.output<typeof webChatConfigSchema>;
export type WebChatConfigInput = z.input<typeof webChatConfigSchema>;
