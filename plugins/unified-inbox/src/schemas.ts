import {
  inboxItemSchema,
  inboxSourceMetadataSchema,
  type InboxItem,
  type InboxSourceMetadata,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

interface InboxProjectionEntryValue {
  source: InboxSourceMetadata;
  item: InboxItem;
}

export const inboxProjectionEntrySchema: z.ZodType<
  InboxProjectionEntryValue,
  InboxProjectionEntryValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  item: inboxItemSchema,
});

interface InboxSourceErrorValue {
  source: InboxSourceMetadata;
  error: "Source unavailable";
}

export const inboxSourceErrorSchema: z.ZodType<
  InboxSourceErrorValue,
  InboxSourceErrorValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  error: z.literal("Source unavailable"),
});

interface InboxProjectionValue {
  entries: InboxProjectionEntryValue[];
  errors: InboxSourceErrorValue[];
}

export const inboxProjectionSchema: z.ZodType<
  InboxProjectionValue,
  InboxProjectionValue
> = z.strictObject({
  entries: z.array(inboxProjectionEntrySchema).max(10_000),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
});

interface InboxListFilterValue {
  sourceId?: string | undefined;
  urgency?: "high" | "normal" | undefined;
  limit: number;
}

interface InboxListFilterInputValue {
  sourceId?: string | undefined;
  urgency?: "high" | "normal" | undefined;
  limit?: number | undefined;
}

const inboxSourceIdSchema: z.ZodString = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*$/);
const inboxUrgencySchema: z.ZodEnum<{
  high: "high";
  normal: "normal";
}> = z.enum(["high", "normal"]);

export const inboxListFilterShape: {
  sourceId: z.ZodOptional<typeof inboxSourceIdSchema>;
  urgency: z.ZodOptional<typeof inboxUrgencySchema>;
  limit: z.ZodDefault<z.ZodNumber>;
} = {
  sourceId: inboxSourceIdSchema.optional(),
  urgency: inboxUrgencySchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const inboxListFilterSchema: z.ZodType<
  InboxListFilterValue,
  InboxListFilterInputValue
> = z.strictObject(inboxListFilterShape);

interface InboxListResultValue {
  entries: InboxProjectionEntryValue[];
  errors: InboxSourceErrorValue[];
  total: number;
}

export const inboxListResultSchema: z.ZodType<
  InboxListResultValue,
  InboxListResultValue
> = z.strictObject({
  entries: z.array(inboxProjectionEntrySchema).max(100),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
  total: z.number().int().nonnegative(),
});

interface InboxActionRequestValue {
  sourceId: string;
  itemId: string;
  actionId: string;
  confirmed: boolean;
}

interface InboxActionRequestInputValue {
  sourceId: string;
  itemId: string;
  actionId: string;
  confirmed?: boolean | undefined;
}

export const inboxActionRequestSchema: z.ZodType<
  InboxActionRequestValue,
  InboxActionRequestInputValue
> = z.strictObject({
  sourceId: inboxSourceIdSchema,
  itemId: z.string().trim().min(1).max(300),
  actionId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/),
  confirmed: z.boolean().default(false),
});

interface InboxActionConfirmationValue {
  kind: "confirmation";
  summary: string;
}

export const inboxActionConfirmationSchema: z.ZodType<
  InboxActionConfirmationValue,
  InboxActionConfirmationValue
> = z.strictObject({
  kind: z.literal("confirmation"),
  summary: z.string().min(1).max(300),
});

interface InboxActionCompletedValue {
  kind: "completed";
  data: InboxProjectionValue;
}

export const inboxActionCompletedSchema: z.ZodType<
  InboxActionCompletedValue,
  InboxActionCompletedValue
> = z.strictObject({
  kind: z.literal("completed"),
  data: inboxProjectionSchema,
});

type InboxActionOutcomeValue =
  InboxActionConfirmationValue | InboxActionCompletedValue;

export const inboxActionOutcomeSchema: z.ZodType<
  InboxActionOutcomeValue,
  InboxActionOutcomeValue
> = z.union([inboxActionConfirmationSchema, inboxActionCompletedSchema]);

interface InboxDigestAlertValue {
  dedupeKey: string;
  title: string;
  body: string;
}

export const inboxDigestAlertSchema: z.ZodType<
  InboxDigestAlertValue,
  InboxDigestAlertValue
> = z.strictObject({
  dedupeKey: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});

interface InboxListToolSuccessValue {
  success: true;
  data: InboxListResultValue;
}

interface InboxListToolErrorValue {
  success: false;
  error: string;
}

type InboxListToolOutputValue =
  InboxListToolSuccessValue | InboxListToolErrorValue;

export const inboxListToolOutputSchema: z.ZodType<
  InboxListToolOutputValue,
  InboxListToolOutputValue
> = z.discriminatedUnion("success", [
  z.strictObject({
    success: z.literal(true),
    data: inboxListResultSchema,
  }),
  z.strictObject({
    success: z.literal(false),
    error: z.string().min(1),
  }),
]);

export type InboxProjectionEntry = z.output<typeof inboxProjectionEntrySchema>;
export type InboxSourceError = z.output<typeof inboxSourceErrorSchema>;
export type InboxProjection = z.output<typeof inboxProjectionSchema>;
export type InboxListFilter = z.output<typeof inboxListFilterSchema>;
export type InboxListResult = z.output<typeof inboxListResultSchema>;
export type InboxActionRequest = z.output<typeof inboxActionRequestSchema>;
export type InboxActionOutcome = z.output<typeof inboxActionOutcomeSchema>;
export type InboxListToolOutput = z.output<typeof inboxListToolOutputSchema>;
export type InboxDigestAlert = z.output<typeof inboxDigestAlertSchema>;
