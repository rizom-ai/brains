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
  type MailCategory,
  type MailPriority,
  type MailStatus,
} from "../entity/schemas/mail-item";

interface MailTriageFilterValue {
  category?: MailCategory | null | undefined;
  priority?: MailPriority | undefined;
  status?: MailStatus | undefined;
  needsReply?: boolean | undefined;
  limit: number;
}

interface MailTriageFilterInputValue {
  category?: MailCategory | null | undefined;
  priority?: MailPriority | undefined;
  status?: MailStatus | undefined;
  needsReply?: boolean | undefined;
  limit?: number | undefined;
}

export const mailTriageFilterShape: {
  category: z.ZodOptional<z.ZodNullable<typeof mailCategorySchema>>;
  priority: z.ZodOptional<typeof mailPrioritySchema>;
  status: z.ZodOptional<typeof mailStatusSchema>;
  needsReply: z.ZodOptional<z.ZodBoolean>;
  limit: z.ZodDefault<z.ZodNumber>;
} = {
  category: mailCategorySchema.nullable().optional(),
  priority: mailPrioritySchema.optional(),
  status: mailStatusSchema.optional(),
  needsReply: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const mailTriageFilterSchema: z.ZodType<
  MailTriageFilterValue,
  MailTriageFilterInputValue
> = z.strictObject(mailTriageFilterShape);

interface MailTriageListItemValue {
  id: string;
  title: string;
  category: MailCategory | null;
  priority: MailPriority;
  status: MailStatus;
  needsReply: boolean;
  receivedAt: string;
  summary: string;
  senderLabel?: string | undefined;
  personId?: string | undefined;
  organization?: string | undefined;
  requestedActions: string[];
}

export const mailTriageListItemSchema: z.ZodType<
  MailTriageListItemValue,
  MailTriageListItemValue
> = z.strictObject({
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
  organization: z.string().min(1).max(200).optional(),
  requestedActions: z.array(z.string().min(1).max(240)).max(10),
});

interface MailTriageListResultValue {
  items: MailTriageListItemValue[];
  total: number;
}

export const mailTriageListResultSchema: z.ZodType<
  MailTriageListResultValue,
  MailTriageListResultValue
> = z.strictObject({
  items: z.array(mailTriageListItemSchema),
  total: z.number().int().nonnegative(),
});

export const mailTriageListToolOutputSchema: z.ZodType<
  ListToolOutput<MailTriageListResultValue>,
  ListToolOutput<MailTriageListResultValue>
> = createListToolOutputSchema(mailTriageListResultSchema);

interface MailTriageSummaryValue {
  total: number;
  new: number;
  high: number;
  needsReply: number;
  unclassified: number;
}

export const mailTriageSummarySchema: z.ZodType<
  MailTriageSummaryValue,
  MailTriageSummaryValue
> = z.strictObject({
  total: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  needsReply: z.number().int().nonnegative(),
  unclassified: z.number().int().nonnegative(),
});

interface MailTriageWorkspaceSnapshotValue {
  summary: MailTriageSummaryValue;
  items: MailTriageListItemValue[];
}

export const mailTriageWorkspaceSnapshotSchema: z.ZodType<
  MailTriageWorkspaceSnapshotValue,
  MailTriageWorkspaceSnapshotValue
> = z.strictObject({
  summary: mailTriageSummarySchema,
  items: z.array(mailTriageListItemSchema),
});

interface MarkReviewedActionValue {
  type: "mark-reviewed";
  id: string;
}

interface MarkHandledActionValue {
  type: "mark-handled";
  id: string;
}

interface ArchiveActionValue {
  type: "archive";
  id: string;
}

type MailTriageStatusActionValue =
  MarkReviewedActionValue | MarkHandledActionValue | ArchiveActionValue;

const markReviewedActionSchema = z.strictObject({
  type: z.literal("mark-reviewed"),
  id: z.string().min(1),
});

const markHandledActionSchema = z.strictObject({
  type: z.literal("mark-handled"),
  id: z.string().min(1),
});

const archiveActionSchema = z.strictObject({
  type: z.literal("archive"),
  id: z.string().min(1),
});

export const mailTriageStatusActionSchema: z.ZodType<
  MailTriageStatusActionValue,
  MailTriageStatusActionValue
> = z.discriminatedUnion("type", [
  markReviewedActionSchema,
  markHandledActionSchema,
  archiveActionSchema,
]);

interface MailTriageStatusActionResultValue {
  id: string;
  status: MailStatus;
}

export const mailTriageStatusActionResultSchema: z.ZodType<
  MailTriageStatusActionResultValue,
  MailTriageStatusActionResultValue
> = z.strictObject({
  id: z.string().min(1),
  status: mailStatusSchema,
});

interface MailTriageDashboardDataValue {
  summary: MailTriageSummaryValue;
  managementUrl?: string | undefined;
}

export const mailTriageDashboardDataSchema: z.ZodType<
  MailTriageDashboardDataValue,
  MailTriageDashboardDataValue
> = z.strictObject({
  summary: mailTriageSummarySchema,
  managementUrl: z.string().min(1).optional(),
});

export type MailTriageFilter = z.output<typeof mailTriageFilterSchema>;
export type MailTriageListItem = z.output<typeof mailTriageListItemSchema>;
export type MailTriageListResult = z.output<typeof mailTriageListResultSchema>;
export type MailTriageListToolOutput = z.output<
  typeof mailTriageListToolOutputSchema
>;
export type MailTriageSummary = z.output<typeof mailTriageSummarySchema>;
export type MailTriageWorkspaceSnapshot = z.output<
  typeof mailTriageWorkspaceSnapshotSchema
>;
export type MailTriageStatusAction = z.output<
  typeof mailTriageStatusActionSchema
>;
export type MailTriageStatusActionResult = z.output<
  typeof mailTriageStatusActionResultSchema
>;
export type MailTriageDashboardData = z.output<
  typeof mailTriageDashboardDataSchema
>;
