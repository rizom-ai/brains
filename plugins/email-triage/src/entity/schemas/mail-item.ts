import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

const mailCategories = [
  "opportunity",
  "recruiting",
  "work",
  "administrative",
  "personal",
] as const;

type MailCategoryValue = (typeof mailCategories)[number];

export const mailCategorySchema: z.ZodType<
  MailCategoryValue,
  MailCategoryValue
> = z.enum(mailCategories);

const mailPriorities = ["high", "normal", "low"] as const;
type MailPriorityValue = (typeof mailPriorities)[number];

export const mailPrioritySchema: z.ZodType<
  MailPriorityValue,
  MailPriorityValue
> = z.enum(mailPriorities);

const mailStatuses = ["new", "reviewed", "handled", "archived"] as const;
type MailStatusValue = (typeof mailStatuses)[number];

export const mailStatusSchema: z.ZodType<MailStatusValue, MailStatusValue> =
  z.enum(mailStatuses);

interface MailItemSourceValue {
  ref: string;
  senderKey: string;
  threadKey?: string | undefined;
  personId?: string | undefined;
  domain?: string | undefined;
}

export const mailItemSourceSchema: z.ZodType<
  MailItemSourceValue,
  MailItemSourceValue
> = z.strictObject({
  ref: z.string().min(1).max(1_024),
  senderKey: z.string().regex(/^[a-f0-9]{64}$/),
  threadKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  personId: z.string().min(1).max(200).optional(),
  domain: z.string().min(1).max(253).optional(),
});

type MailItemFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  category: z.ZodDefault<z.ZodNullable<typeof mailCategorySchema>>;
  priority: typeof mailPrioritySchema;
  status: typeof mailStatusSchema;
  needsReply: z.ZodBoolean;
  receivedAt: ReturnType<typeof z.iso.datetime>;
  source: typeof mailItemSourceSchema;
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
    organization: z.string().min(1).max(200).optional(),
    requestedActions: z.array(z.string().min(1).max(240)).max(10),
  });

type MailItemMetadataSchema = z.ZodObject<
  Pick<
    MailItemFrontmatterSchema["shape"],
    "title" | "category" | "priority" | "status" | "needsReply" | "receivedAt"
  >
>;

export const mailItemMetadataSchema: MailItemMetadataSchema =
  mailItemFrontmatterSchema.pick({
    title: true,
    category: true,
    priority: true,
    status: true,
    needsReply: true,
    receivedAt: true,
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
