import type { Plugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { newsletterPlugin } from "@brains/newsletter-entity";
import { buttondownPlugin } from "@brains/buttondown";

/**
 * Composite config for the newsletter feature.
 *
 * Distributes shared credentials and behavior to the newsletter entity plugin
 * and the buttondown service plugin. One brain.yaml block configures both.
 */
export const newsletterCompositeConfigSchema = z.object({
  apiKey: z.string().optional().describe("Buttondown API key"),
  doubleOptIn: z
    .boolean()
    .optional()
    .describe("Require email confirmation for new subscribers"),
  autoSendOnPublish: z
    .boolean()
    .optional()
    .describe("Automatically send newsletter when a blog post is published"),
});

export type NewsletterCompositeConfig = z.infer<
  typeof newsletterCompositeConfigSchema
>;

/**
 * Composite factory: returns the newsletter entity plugin + buttondown service
 * plugin from a single shared config block.
 *
 * Use as a capability factory in `defineBrain()`:
 *
 * ```ts
 * capabilities: [
 *   ["newsletter", newsletter, { apiKey: "${BUTTONDOWN_API_KEY}" }],
 * ]
 * ```
 *
 * The composite is gated by the capability id `newsletter` — adding or removing
 * it from a preset enables or disables both sub-plugins.
 */
export function newsletter(config: NewsletterCompositeConfig = {}): Plugin[] {
  const parsed = newsletterCompositeConfigSchema.parse(config);
  return [
    newsletterPlugin({}),
    buttondownPlugin({
      ...(parsed.apiKey !== undefined && { apiKey: parsed.apiKey }),
      ...(parsed.doubleOptIn !== undefined && {
        doubleOptIn: parsed.doubleOptIn,
      }),
      ...(parsed.autoSendOnPublish !== undefined && {
        autoSendOnPublish: parsed.autoSendOnPublish,
      }),
    }),
  ];
}
