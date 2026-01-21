import { z } from "@brains/utils";

/**
 * Buttondown API configuration
 */
export const buttondownConfigSchema = z.object({
  apiKey: z.string().describe("Buttondown API key"),
  doubleOptIn: z
    .boolean()
    .default(true)
    .describe("Require email confirmation for new subscribers"),
});

/**
 * Newsletter plugin configuration schema
 */
export const newsletterConfigSchema = z.object({
  buttondown: buttondownConfigSchema.optional(),
  autoSendOnPublish: z
    .boolean()
    .default(false)
    .describe("Automatically send newsletter when a blog post is published"),
});

export type ButtondownConfig = z.infer<typeof buttondownConfigSchema>;
export type NewsletterConfig = z.infer<typeof newsletterConfigSchema>;
