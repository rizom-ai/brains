import { z } from "@brains/utils/zod";

export const webChatConfigSchema = z.object({
  routePath: z.string().default("/chat"),
  apiPath: z.string().default("/api/chat"),
});

export type WebChatConfig = z.infer<typeof webChatConfigSchema>;
