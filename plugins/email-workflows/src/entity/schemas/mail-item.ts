import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

const mailCategories = [
  "opportunity",
  "recruiting",
  "work",
  "administrative",
  "personal",
] as const;

export const mailCategorySchema: z.ZodEnum<{
  opportunity: "opportunity";
  recruiting: "recruiting";
  work: "work";
  administrative: "administrative";
  personal: "personal";
}> = z.enum(mailCategories);

const mailPriorities = ["high", "normal", "low"] as const;

export const mailPrioritySchema: z.ZodEnum<{
  high: "high";
  normal: "normal";
  low: "low";
}> = z.enum(mailPriorities);

const mailStatuses = ["new", "reviewed", "handled", "archived"] as const;

export const mailStatusSchema: z.ZodEnum<{
  new: "new";
  reviewed: "reviewed";
  handled: "handled";
  archived: "archived";
}> = z.enum(mailStatuses);

export const mailThreadKeySchema: z.ZodString = z
  .string()
  .regex(/^[a-f0-9]{64}$/);

export const mailThreadOrdinalSchema: z.ZodNumber = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

type MailItemSourceSchema = z.ZodObject<
  {
    ref: z.ZodString;
    senderKey: z.ZodString;
    threadKey: z.ZodOptional<typeof mailThreadKeySchema>;
    threadOrdinal: z.ZodOptional<typeof mailThreadOrdinalSchema>;
    personId: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;

export const mailItemSourceSchema: MailItemSourceSchema = z
  .strictObject({
    ref: z.string().min(1).max(1_024),
    senderKey: z.string().regex(/^[a-f0-9]{64}$/),
    threadKey: mailThreadKeySchema.optional(),
    threadOrdinal: mailThreadOrdinalSchema.optional(),
    personId: z.string().min(1).max(200).optional(),
    domain: z.string().min(1).max(253).optional(),
  })
  .refine(
    (source) =>
      source.threadOrdinal === undefined || source.threadKey !== undefined,
    {
      path: ["threadOrdinal"],
      message: "A thread ordinal requires a thread key",
    },
  );

export const mailSenderLabelSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !value.includes("@"), {
    message: "Sender labels must not contain an email address",
  });

type MailItemFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  category: z.ZodDefault<z.ZodNullable<typeof mailCategorySchema>>;
  priority: typeof mailPrioritySchema;
  status: typeof mailStatusSchema;
  needsReply: z.ZodBoolean;
  receivedAt: z.ZodISODateTime;
  source: typeof mailItemSourceSchema;
  senderLabel: z.ZodOptional<typeof mailSenderLabelSchema>;
  organization: z.ZodOptional<z.ZodString>;
  requestedActions: z.ZodArray<z.ZodString>;
}>;

export const mailItemFrontmatterSchema: MailItemFrontmatterSchema =
  z.strictObject({
    title: z.string().min(1).max(160),
    category: mailCategorySchema.nullable().default(null),
    priority: mailPrioritySchema,
    status: mailStatusSchema,
    needsReply: z.boolean(),
    receivedAt: z.iso.datetime(),
    source: mailItemSourceSchema,
    senderLabel: mailSenderLabelSchema.optional(),
    organization: z.string().min(1).max(200).optional(),
    requestedActions: z.array(z.string().min(1).max(240)).max(10),
  });

type MailItemMetadataSchema = z.ZodObject<
  Pick<
    MailItemFrontmatterSchema["shape"],
    "title" | "category" | "priority" | "status" | "needsReply" | "receivedAt"
  > & {
    threadKey: z.ZodOptional<typeof mailThreadKeySchema>;
    threadOrdinal: z.ZodOptional<typeof mailThreadOrdinalSchema>;
  }
>;

export const mailItemMetadataSchema: MailItemMetadataSchema =
  mailItemFrontmatterSchema
    .pick({
      title: true,
      category: true,
      priority: true,
      status: true,
      needsReply: true,
      receivedAt: true,
    })
    .extend({
      threadKey: mailThreadKeySchema.optional(),
      threadOrdinal: mailThreadOrdinalSchema.optional(),
    });

export const mailItemSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"mail-item">;
    metadata: MailItemMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("mail-item"),
  metadata: mailItemMetadataSchema,
});

export type MailCategory = z.output<typeof mailCategorySchema>;
export type MailPriority = z.output<typeof mailPrioritySchema>;
export type MailStatus = z.output<typeof mailStatusSchema>;
export type MailItemSource = z.output<typeof mailItemSourceSchema>;
export type MailItemFrontmatter = z.output<typeof mailItemFrontmatterSchema>;
export type MailItemMetadata = z.output<typeof mailItemMetadataSchema>;
export type MailItemEntity = z.output<typeof mailItemSchema>;
