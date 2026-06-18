import { z } from "@brains/utils";

export const webChatConfigSchema = z.object({
  routePath: z.string().default("/chat"),
  apiPath: z.string().default("/api/chat"),
});

export type WebChatConfig = z.output<typeof webChatConfigSchema>;
export type WebChatConfigInput = z.input<typeof webChatConfigSchema>;
