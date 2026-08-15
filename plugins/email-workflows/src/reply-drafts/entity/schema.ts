import { baseEntityParserSchema, inboxItemIdSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type EmailReplyDraftFrontmatterSchema = z.ZodObject<{
  mailItemId: typeof inboxItemIdSchema;
  revision: z.ZodNumber;
  status: z.ZodLiteral<"draft">;
  updatedAt: ReturnType<typeof z.iso.datetime>;
}>;

export const emailReplyDraftFrontmatterSchema: EmailReplyDraftFrontmatterSchema =
  z.strictObject({
    mailItemId: inboxItemIdSchema,
    revision: z.number().int().positive(),
    status: z.literal("draft"),
    updatedAt: z.iso.datetime(),
  });

type EmailReplyDraftMetadataSchema = z.ZodObject<
  Pick<
    EmailReplyDraftFrontmatterSchema["shape"],
    "mailItemId" | "revision" | "status" | "updatedAt"
  >
>;

const emailReplyDraftMetadataSchema: EmailReplyDraftMetadataSchema =
  emailReplyDraftFrontmatterSchema.pick({
    mailItemId: true,
    revision: true,
    status: true,
    updatedAt: true,
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

export const emailReplyTextSchema: z.ZodType<string, string> = z
  .string()
  .trim()
  .min(1)
  .max(20_000);

export type EmailReplyDraftFrontmatter = z.output<
  typeof emailReplyDraftFrontmatterSchema
>;
export type EmailReplyDraftMetadata = z.output<
  typeof emailReplyDraftMetadataSchema
>;
export type EmailReplyDraftEntity = z.output<typeof emailReplyDraftSchema>;
