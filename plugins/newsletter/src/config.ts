import { z } from "@brains/sdk/services";

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

type NewsletterConfigSchema = z.ZodObject<{
  provider: z.ZodOptional<NewsletterProviderConfigSchema>;
  autoSendOnPublish: z.ZodDefault<z.ZodBoolean>;
}>;

export const newsletterConfigSchema: NewsletterConfigSchema = z.strictObject({
  provider: newsletterProviderConfigSchema.optional(),
  autoSendOnPublish: z
    .boolean()
    .default(false)
    .describe("Automatically send newsletter when a blog post is published"),
});

export type NewsletterConfig = z.output<typeof newsletterConfigSchema>;
export type NewsletterConfigInput = z.input<typeof newsletterConfigSchema>;
