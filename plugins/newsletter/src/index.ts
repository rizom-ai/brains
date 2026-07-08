import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { newsletterPlugin } from "./entity";
import { buttondownPlugin } from "./provider";

export { NewsletterPlugin, newsletterPlugin } from "./entity";
export type {
  Newsletter,
  NewsletterMetadata,
  NewsletterStatus,
  CreateNewsletterInput,
} from "./entity";
export {
  newsletterSchema,
  newsletterMetadataSchema,
  newsletterStatusSchema,
  createNewsletter,
} from "./entity";
export { ButtondownPlugin, buttondownPlugin } from "./provider";
export { ButtondownClient } from "./provider";
export type {
  Subscriber,
  SubscriberType,
  CreateSubscriberInput,
  ButtondownEmail,
  EmailStatus,
  CreateEmailInput,
} from "./provider";

/**
 * Composite config for the newsletter feature.
 *
 * Distributes shared credentials and behavior to the newsletter entity plugin
 * and the buttondown service plugin. One brain.yaml block configures both.
 */
export interface NewsletterCompositeConfig {
  apiKey?: string | undefined;
  doubleOptIn?: boolean | undefined;
  autoSendOnPublish?: boolean | undefined;
}

export type NewsletterCompositeConfigInput = NewsletterCompositeConfig;

export const newsletterCompositeConfigSchema: z.ZodType<
  NewsletterCompositeConfig,
  NewsletterCompositeConfigInput
> = z.object({
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
export function newsletter(
  config: NewsletterCompositeConfigInput = {},
): Plugin[] {
  const parsedConfig = newsletterCompositeConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    throw new PluginConfigValidationError(
      "newsletter",
      parsedConfig.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  const parsed = parsedConfig.data;
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
