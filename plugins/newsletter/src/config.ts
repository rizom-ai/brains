import { z } from "@brains/sdk/services";

/**
 * One brain.yaml block configures the whole package: the Buttondown
 * credentials the service sends with, and how it behaves once it has them.
 */
export const newsletterConfigSchema: z.ZodObject<{
  apiKey: z.ZodOptional<z.ZodString>;
  doubleOptIn: z.ZodDefault<z.ZodBoolean>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  apiKey: z.string().optional().describe("Buttondown API key"),
  doubleOptIn: z
    .boolean()
    .default(true)
    .describe("Require email confirmation for new subscribers"),
  autoSendOnPublish: z
    .boolean()
    .default(false)
    .describe("Automatically send newsletter when a blog post is published"),
});

export type NewsletterConfig = z.output<typeof newsletterConfigSchema>;
export type NewsletterConfigInput = z.input<typeof newsletterConfigSchema>;
