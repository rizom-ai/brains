import { baseEntityParserSchema, inboxItemIdSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export const emailReplyDraftStatusSchema: z.ZodEnum<{
  draft: "draft";
  sent: "sent";
}> = z.enum(["draft", "sent"]);

type EmailReplyDraftFrontmatterSchema = z.ZodObject<{
  mailItemId: typeof inboxItemIdSchema;
  revision: z.ZodNumber;
  status: typeof emailReplyDraftStatusSchema;
  updatedAt: z.ZodISODateTime;
  sentAt: z.ZodOptional<z.ZodISODateTime>;
  providerDeliveryId: z.ZodOptional<z.ZodString>;
}>;

export const emailReplyDraftFrontmatterSchema: EmailReplyDraftFrontmatterSchema =
  z.strictObject({
    mailItemId: inboxItemIdSchema,
    revision: z.number().int().positive(),
    status: emailReplyDraftStatusSchema,
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime().optional(),
    providerDeliveryId: z.string().trim().min(1).max(1_000).optional(),
  });

type EmailReplyDraftMetadataSchema = z.ZodObject<
  Pick<
    EmailReplyDraftFrontmatterSchema["shape"],
    | "mailItemId"
    | "revision"
    | "status"
    | "updatedAt"
    | "sentAt"
    | "providerDeliveryId"
  >
>;

const emailReplyDraftMetadataSchema: EmailReplyDraftMetadataSchema =
  emailReplyDraftFrontmatterSchema.pick({
    mailItemId: true,
    revision: true,
    status: true,
    updatedAt: true,
    sentAt: true,
    providerDeliveryId: true,
  });

export const emailReplyDraftSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"email-reply-draft">;
    metadata: EmailReplyDraftMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("email-reply-draft"),
  metadata: emailReplyDraftMetadataSchema,
});

export const emailReplyTextSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(20_000);

export type EmailReplyDraftStatus = z.output<
  typeof emailReplyDraftStatusSchema
>;
export type EmailReplyDraftFrontmatter = z.output<
  typeof emailReplyDraftFrontmatterSchema
>;
export type EmailReplyDraftMetadata = z.output<
  typeof emailReplyDraftMetadataSchema
>;
export type EmailReplyDraftEntity = z.output<typeof emailReplyDraftSchema>;
