import {
  createListToolOutputSchema,
  inboxContactSchema,
  inboxIdSchema,
  inboxItemIdSchema,
  inboxItemSchema,
  inboxSourceMetadataSchema,
  inboxUrgencySchema,
  type InboxItem,
  type InboxSourceMetadata,
  type ListToolOutput,
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

export const inboxListFilterShape: {
  sourceId: z.ZodOptional<typeof inboxIdSchema>;
  urgency: z.ZodOptional<typeof inboxUrgencySchema>;
  limit: z.ZodDefault<z.ZodNumber>;
} = {
  sourceId: inboxIdSchema.optional(),
  urgency: inboxUrgencySchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const inboxListFilterSchema: z.ZodType<
  InboxListFilterValue,
  InboxListFilterInputValue
> = z.strictObject(inboxListFilterShape);

interface InboxListItemValue {
  title: string;
  summary?: string | undefined;
  contact?: InboxItem["contact"] | undefined;
  receivedAt: string;
  urgency: "high" | "normal";
}

export const inboxListItemSchema: z.ZodType<
  InboxListItemValue,
  InboxListItemValue
> = z.strictObject({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_000).optional(),
  contact: inboxContactSchema.optional(),
  receivedAt: z.iso.datetime(),
  urgency: inboxUrgencySchema,
});

interface InboxListEntryValue {
  source: InboxSourceMetadata;
  item: InboxListItemValue;
}

export const inboxListEntrySchema: z.ZodType<
  InboxListEntryValue,
  InboxListEntryValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  item: inboxListItemSchema,
});

interface InboxListResultValue {
  entries: InboxListEntryValue[];
  errors: InboxSourceErrorValue[];
  total: number;
}

export const inboxListResultSchema: z.ZodType<
  InboxListResultValue,
  InboxListResultValue
> = z.strictObject({
  entries: z.array(inboxListEntrySchema).max(100),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
  total: z.number().int().nonnegative(),
});

interface InboxWorkspaceQueryValue {
  sourceId?: string | undefined;
  urgency?: "high" | "normal" | undefined;
  offset: number;
  limit: number;
}

function queryInteger(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return value;
  return Number(value);
}

const inboxWorkspaceOffsetSchema = z.preprocess(
  queryInteger,
  z.number().int().min(0).max(10_000),
);
const inboxWorkspaceLimitSchema = z.preprocess(
  queryInteger,
  z.number().int().min(1).max(100),
);

export const inboxWorkspaceQuerySchema: z.ZodType<
  InboxWorkspaceQueryValue,
  unknown
> = z.strictObject({
  sourceId: inboxIdSchema.optional(),
  urgency: inboxUrgencySchema.optional(),
  offset: inboxWorkspaceOffsetSchema.default(0),
  limit: inboxWorkspaceLimitSchema.default(50),
});

/** Normalize each URL/request field independently so one bad filter fails open. */
export function normalizeInboxWorkspaceQuery(
  input: unknown,
  sourceIds: readonly string[],
): InboxWorkspaceQueryValue {
  const raw =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const sourceId = inboxIdSchema.safeParse(raw["sourceId"]);
  const urgency = inboxUrgencySchema.safeParse(raw["urgency"]);
  const offset = inboxWorkspaceOffsetSchema.safeParse(raw["offset"]);
  const limit = inboxWorkspaceLimitSchema.safeParse(raw["limit"]);
  const knownSources = new Set(sourceIds);
  return inboxWorkspaceQuerySchema.parse({
    ...(sourceId.success && knownSources.has(sourceId.data)
      ? { sourceId: sourceId.data }
      : {}),
    ...(urgency.success ? { urgency: urgency.data } : {}),
    offset: offset.success ? offset.data : 0,
    limit: limit.success ? limit.data : 50,
  });
}

interface InboxSourceAvailabilityValue {
  source: InboxSourceMetadata;
  open: number;
  high: number;
  available: boolean;
}

export const inboxSourceAvailabilitySchema: z.ZodType<
  InboxSourceAvailabilityValue,
  InboxSourceAvailabilityValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  open: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  available: z.boolean(),
});

interface InboxWorkspaceEntryValue extends InboxProjectionEntryValue {
  contactHref?: string | undefined;
}

const inboxContactHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(isSafeSameOriginPath, { message: "Invalid contact target" });

export const inboxWorkspaceEntrySchema: z.ZodType<
  InboxWorkspaceEntryValue,
  InboxWorkspaceEntryValue
> = z.strictObject({
  source: inboxSourceMetadataSchema,
  item: inboxItemSchema,
  contactHref: inboxContactHrefSchema.optional(),
});

interface InboxWorkspaceSnapshotValue {
  summary: { open: number; high: number };
  sources: InboxSourceAvailabilityValue[];
  entries: InboxWorkspaceEntryValue[];
  errors: InboxSourceErrorValue[];
  total: number;
  offset: number;
  limit: number;
}

export const inboxWorkspaceSnapshotSchema: z.ZodType<
  InboxWorkspaceSnapshotValue,
  InboxWorkspaceSnapshotValue
> = z.strictObject({
  summary: z.strictObject({
    open: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  }),
  sources: z.array(inboxSourceAvailabilitySchema).max(1_000),
  entries: z.array(inboxWorkspaceEntrySchema).max(100),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
});

interface InboxDashboardEntryValue {
  sourceLabel: string;
  urgency: "high" | "normal";
  title: string;
  receivedAt: string;
}

export const inboxDashboardEntrySchema: z.ZodType<
  InboxDashboardEntryValue,
  InboxDashboardEntryValue
> = z.strictObject({
  sourceLabel: z.string().trim().min(1).max(200),
  urgency: inboxUrgencySchema,
  title: z.string().trim().min(1).max(500),
  receivedAt: z.iso.datetime(),
});

interface InboxDashboardDataValue {
  summary: {
    open: number;
    high: number;
    availableSources: number;
    unavailableSources: number;
  };
  entries: InboxDashboardEntryValue[];
  managementUrl?: string | undefined;
}

export const inboxDashboardDataSchema: z.ZodType<
  InboxDashboardDataValue,
  InboxDashboardDataValue
> = z.strictObject({
  summary: z.strictObject({
    open: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    availableSources: z.number().int().nonnegative(),
    unavailableSources: z.number().int().nonnegative(),
  }),
  entries: z.array(inboxDashboardEntrySchema).max(5),
  managementUrl: z.string().trim().min(1).max(2_048).optional(),
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
  sourceId: inboxIdSchema,
  itemId: inboxItemIdSchema,
  actionId: inboxIdSchema,
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
}

export const inboxActionCompletedSchema: z.ZodType<
  InboxActionCompletedValue,
  InboxActionCompletedValue
> = z.strictObject({
  kind: z.literal("completed"),
});

interface InboxActionErrorValue {
  kind: "error";
  error: "Invalid inbox action" | "Inbox action failed";
}

export const inboxActionErrorSchema: z.ZodType<
  InboxActionErrorValue,
  InboxActionErrorValue
> = z.strictObject({
  kind: z.literal("error"),
  error: z.enum(["Invalid inbox action", "Inbox action failed"]),
});

type InboxActionOutcomeValue =
  | InboxActionConfirmationValue
  | InboxActionCompletedValue
  | InboxActionErrorValue;

export const inboxActionOutcomeSchema: z.ZodType<
  InboxActionOutcomeValue,
  InboxActionOutcomeValue
> = z.union([
  inboxActionConfirmationSchema,
  inboxActionCompletedSchema,
  inboxActionErrorSchema,
]);

/**
 * Shape of the daily digest alert. Validated by the recurring-checks service
 * on receipt, so no schema is duplicated here.
 */
export interface InboxDigestAlert {
  dedupeKey: string;
  title: string;
  body: string;
}

export const inboxListToolOutputSchema: z.ZodType<
  ListToolOutput<InboxListResultValue>,
  ListToolOutput<InboxListResultValue>
> = createListToolOutputSchema(inboxListResultSchema);

function isSafeSameOriginPath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  ) {
    return false;
  }
  try {
    return (
      new URL(value, "https://brains.invalid").origin ===
      "https://brains.invalid"
    );
  } catch {
    return false;
  }
}

export type InboxProjectionEntry = z.output<typeof inboxProjectionEntrySchema>;
export type InboxSourceError = z.output<typeof inboxSourceErrorSchema>;
export type InboxProjection = z.output<typeof inboxProjectionSchema>;
export type InboxListFilter = z.output<typeof inboxListFilterSchema>;
export type InboxListEntry = z.output<typeof inboxListEntrySchema>;
export type InboxListResult = z.output<typeof inboxListResultSchema>;
export type InboxWorkspaceQuery = z.output<typeof inboxWorkspaceQuerySchema>;
export type InboxWorkspaceEntry = z.output<typeof inboxWorkspaceEntrySchema>;
export type InboxSourceAvailability = z.output<
  typeof inboxSourceAvailabilitySchema
>;
export type InboxWorkspaceSnapshot = z.output<
  typeof inboxWorkspaceSnapshotSchema
>;
export type InboxDashboardData = z.output<typeof inboxDashboardDataSchema>;
export type InboxActionRequest = z.output<typeof inboxActionRequestSchema>;
export type InboxActionOutcome = z.output<typeof inboxActionOutcomeSchema>;
export type InboxListToolOutput = z.output<typeof inboxListToolOutputSchema>;
