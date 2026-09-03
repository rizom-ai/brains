import {
  createListToolOutputSchema,
  type ListToolOutput,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  mailCategorySchema,
  mailPrioritySchema,
  mailSenderLabelSchema,
  mailStatusSchema,
  mailThreadOrdinalSchema,
} from "../entity/schemas/mail-item";

type MailTriageFilterSchema = z.ZodObject<
  {
    category: z.ZodOptional<z.ZodNullable<typeof mailCategorySchema>>;
    priority: z.ZodOptional<typeof mailPrioritySchema>;
    status: z.ZodOptional<typeof mailStatusSchema>;
    needsReply: z.ZodOptional<z.ZodBoolean>;
    limit: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
>;

export const mailTriageFilterShape: MailTriageFilterSchema["shape"] = {
  category: mailCategorySchema.nullable().optional(),
  priority: mailPrioritySchema.optional(),
  status: mailStatusSchema.optional(),
  needsReply: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const mailTriageFilterSchema: MailTriageFilterSchema = z.strictObject(
  mailTriageFilterShape,
);

type MailTriageListItemSchema = z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    category: z.ZodNullable<typeof mailCategorySchema>;
    priority: typeof mailPrioritySchema;
    status: typeof mailStatusSchema;
    needsReply: z.ZodBoolean;
    receivedAt: z.ZodISODateTime;
    summary: z.ZodString;
    senderLabel: z.ZodOptional<typeof mailSenderLabelSchema>;
    personId: z.ZodOptional<z.ZodString>;
    threadOrdinal: z.ZodOptional<typeof mailThreadOrdinalSchema>;
    organization: z.ZodOptional<z.ZodString>;
    requestedActions: z.ZodArray<z.ZodString>;
  },
  z.core.$strict
>;

export const mailTriageListItemSchema: MailTriageListItemSchema =
  z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1).max(160),
    category: mailCategorySchema.nullable(),
    priority: mailPrioritySchema,
    status: mailStatusSchema,
    needsReply: z.boolean(),
    receivedAt: z.iso.datetime(),
    summary: z.string().min(1).max(1_000),
    senderLabel: mailSenderLabelSchema.optional(),
    personId: z.string().min(1).max(200).optional(),
    threadOrdinal: mailThreadOrdinalSchema.optional(),
    organization: z.string().min(1).max(200).optional(),
    requestedActions: z.array(z.string().min(1).max(240)).max(10),
  });

type MailTriageListResultSchema = z.ZodObject<
  { items: z.ZodArray<MailTriageListItemSchema>; total: z.ZodNumber },
  z.core.$strict
>;

export const mailTriageListResultSchema: MailTriageListResultSchema =
  z.strictObject({
    items: z.array(mailTriageListItemSchema),
    total: z.number().int().nonnegative(),
  });

export type MailTriageFilter = z.output<typeof mailTriageFilterSchema>;
export type MailTriageListItem = z.output<typeof mailTriageListItemSchema>;
export type MailTriageListResult = z.output<typeof mailTriageListResultSchema>;

export const mailTriageListToolOutputSchema: z.ZodType<
  ListToolOutput<MailTriageListResult>,
  ListToolOutput<MailTriageListResult>
> = createListToolOutputSchema(mailTriageListResultSchema);

type MailTriageStatusActionSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { type: z.ZodLiteral<"mark-reviewed">; id: z.ZodString },
      z.core.$strict
    >,
    z.ZodObject<
      { type: z.ZodLiteral<"mark-handled">; id: z.ZodString },
      z.core.$strict
    >,
    z.ZodObject<
      { type: z.ZodLiteral<"archive">; id: z.ZodString },
      z.core.$strict
    >,
  ]
>;

export const mailTriageStatusActionSchema: MailTriageStatusActionSchema =
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("mark-reviewed"), id: z.string().min(1) }),
    z.strictObject({ type: z.literal("mark-handled"), id: z.string().min(1) }),
    z.strictObject({ type: z.literal("archive"), id: z.string().min(1) }),
  ]);

type MailTriageStatusActionResultSchema = z.ZodObject<
  { id: z.ZodString; status: typeof mailStatusSchema },
  z.core.$strict
>;

export const mailTriageStatusActionResultSchema: MailTriageStatusActionResultSchema =
  z.strictObject({
    id: z.string().min(1),
    status: mailStatusSchema,
  });

export type MailTriageListToolOutput = z.output<
  typeof mailTriageListToolOutputSchema
>;
export type MailTriageStatusAction = z.output<
  typeof mailTriageStatusActionSchema
>;
export type MailTriageStatusActionResult = z.output<
  typeof mailTriageStatusActionResultSchema
>;
