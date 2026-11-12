import { z } from "@brains/utils/zod";
import { guestPresetSchema } from "./guest-preset";

type WebChatConfigSchema = z.ZodObject<{
  routePath: z.ZodDefault<z.ZodString>;
  apiPath: z.ZodDefault<z.ZodString>;
  guest: z.ZodOptional<typeof guestPresetSchema>;
}>;

export const webChatConfigSchema: WebChatConfigSchema = z.object({
  routePath: z.string().default("/ask"),
  apiPath: z.string().default("/api/chat"),
  /**
   * Guest chat. Unset, it is off and the owner may switch it on at runtime;
   * set, even to false, the configuration decides.
   */
  guest: guestPresetSchema.optional(),
});

export type WebChatConfig = z.output<typeof webChatConfigSchema>;
export type WebChatConfigInput = z.input<typeof webChatConfigSchema>;
