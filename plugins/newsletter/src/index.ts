import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { newsletterPlugin } from "./entity";
import { buttondownPlugin, resendPlugin } from "./provider";

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
export {
  ButtondownPlugin,
  buttondownPlugin,
  ButtondownClient,
  ButtondownNewsletterProvider,
  ResendPlugin,
  resendPlugin,
  ResendNewsletterClient,
  ResendApiError,
  ResendNewsletterProvider,
  renderNewsletterEmail,
} from "./provider";
export type {
  Subscriber,
  SubscriberType,
  CreateSubscriberInput,
  ButtondownEmail,
  EmailStatus,
  CreateEmailInput,
  ResendPluginConfig,
  ResendPluginConfigInput,
  ResendClientConfig,
  ResendContact,
  ResendContactList,
  ResendBroadcast,
  ResendBroadcastInput,
  NewsletterDeliveryProvider,
  NewsletterSubscriber,
  NewsletterSubscriberList,
  NewsletterSubscriberListInput,
  NewsletterSubscriberStatus,
  NewsletterSubscribeInput,
  RenderNewsletterEmailInput,
  RenderedNewsletterEmail,
} from "./provider";

type ButtondownNewsletterProviderConfigSchema = z.ZodObject<{
  type: z.ZodLiteral<"buttondown">;
  apiKey: z.ZodString;
  doubleOptIn: z.ZodDefault<z.ZodBoolean>;
}>;

const buttondownNewsletterProviderConfigSchema: ButtondownNewsletterProviderConfigSchema =
  z.strictObject({
    type: z.literal("buttondown"),
    apiKey: z.string().trim().min(1).describe("Buttondown API key"),
    doubleOptIn: z
      .boolean()
      .default(true)
      .describe("Require email confirmation for new subscribers"),
  });

type ResendNewsletterProviderConfigSchema = z.ZodObject<{
  type: z.ZodLiteral<"resend">;
  apiKey: z.ZodString;
  segmentId: z.ZodString;
  from: z.ZodString;
  replyTo: z.ZodOptional<z.ZodString>;
  topicId: z.ZodOptional<z.ZodString>;
}>;

const resendNewsletterProviderConfigSchema: ResendNewsletterProviderConfigSchema =
  z.strictObject({
    type: z.literal("resend"),
    apiKey: z.string().trim().min(1).describe("Resend API key"),
    segmentId: z
      .string()
      .trim()
      .min(1)
      .describe("Resend newsletter Segment ID"),
    from: z.string().trim().min(1).describe("Verified Resend sender"),
    replyTo: z.string().trim().min(1).optional(),
    topicId: z.string().trim().min(1).optional(),
  });

type NewsletterProviderConfigSchema = z.ZodDiscriminatedUnion<
  [
    ButtondownNewsletterProviderConfigSchema,
    ResendNewsletterProviderConfigSchema,
  ]
>;

const newsletterProviderConfigSchema: NewsletterProviderConfigSchema =
  z.discriminatedUnion("type", [
    buttondownNewsletterProviderConfigSchema,
    resendNewsletterProviderConfigSchema,
  ]);

type NewsletterCompositeConfigSchema = z.ZodObject<{
  provider: z.ZodOptional<NewsletterProviderConfigSchema>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}>;

export const newsletterCompositeConfigSchema: NewsletterCompositeConfigSchema =
  z.strictObject({
    provider: newsletterProviderConfigSchema.optional(),
    autoSendOnPublish: z
      .boolean()
      .default(false)
      .describe("Automatically send newsletter when a blog post is published"),
  });

export type ButtondownNewsletterProviderConfig = z.output<
  typeof buttondownNewsletterProviderConfigSchema
>;
export type ButtondownNewsletterProviderConfigInput = z.input<
  typeof buttondownNewsletterProviderConfigSchema
>;
export type ResendNewsletterProviderConfig = z.output<
  typeof resendNewsletterProviderConfigSchema
>;
export type ResendNewsletterProviderConfigInput = z.input<
  typeof resendNewsletterProviderConfigSchema
>;
export type NewsletterProviderConfig = z.output<
  typeof newsletterProviderConfigSchema
>;
export type NewsletterProviderConfigInput = z.input<
  typeof newsletterProviderConfigSchema
>;
export type NewsletterCompositeConfig = z.output<
  typeof newsletterCompositeConfigSchema
>;
export type NewsletterCompositeConfigInput = z.input<
  typeof newsletterCompositeConfigSchema
>;

/**
 * Composite factory for newsletter entities plus one optional delivery provider.
 *
 * @example
 * ```ts
 * capabilities: [
 *   ["newsletter", newsletter, {
 *     provider: {
 *       type: "resend",
 *       apiKey: "${RESEND_API_KEY}",
 *       segmentId: "${RESEND_NEWSLETTER_SEGMENT_ID}",
 *       from: "Rizom <newsletter@example.com>",
 *     },
 *   }],
 * ]
 * ```
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
  const plugins: Plugin[] = [newsletterPlugin({})];
  if (!parsed.provider) return plugins;

  if (parsed.provider.type === "buttondown") {
    plugins.push(
      buttondownPlugin({
        apiKey: parsed.provider.apiKey,
        doubleOptIn: parsed.provider.doubleOptIn,
        autoSendOnPublish: parsed.autoSendOnPublish,
      }),
    );
  } else {
    plugins.push(
      resendPlugin({
        apiKey: parsed.provider.apiKey,
        segmentId: parsed.provider.segmentId,
        from: parsed.provider.from,
        ...(parsed.provider.replyTo
          ? { replyTo: parsed.provider.replyTo }
          : {}),
        ...(parsed.provider.topicId
          ? { topicId: parsed.provider.topicId }
          : {}),
        autoSendOnPublish: parsed.autoSendOnPublish,
      }),
    );
  }

  return plugins;
}
