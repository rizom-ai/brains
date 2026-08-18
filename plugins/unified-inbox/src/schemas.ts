import {
  createListToolOutputSchema,
  inboxContactSchema,
  inboxFacetsSchema,
  inboxIdSchema,
  inboxItemDetailSchema,
  inboxItemIdSchema,
  inboxItemSchema,
  inboxSourceDescriptorSchema,
  inboxSourceMetadataSchema,
  inboxUrgencySchema,
  resolvedInboxFollowUpSchema,
  type InboxFacets,
  type InboxItem,
  type InboxItemDetail,
  type InboxSource,
  type InboxSourceDescriptor,
  type ResolvedInboxFollowUp,
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
  facets?: InboxFacets | undefined;
  limit: number;
}

interface InboxListFilterInputValue {
  sourceId?: string | undefined;
  urgency?: "high" | "normal" | undefined;
  facets?: InboxFacets | undefined;
  limit?: number | undefined;
}

export const inboxListFilterShape: {
  sourceId: z.ZodOptional<typeof inboxIdSchema>;
  urgency: z.ZodOptional<typeof inboxUrgencySchema>;
  facets: z.ZodOptional<typeof inboxFacetsSchema>;
  limit: z.ZodDefault<z.ZodNumber>;
} = {
  sourceId: inboxIdSchema.optional(),
  urgency: inboxUrgencySchema.optional(),
  facets: inboxFacetsSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const inboxListFilterSchema: z.ZodType<
  InboxListFilterValue,
  InboxListFilterInputValue
> = z.strictObject(inboxListFilterShape).superRefine((filter, context) => {
  if (filter.facets !== undefined && filter.sourceId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "Inbox facet filters require a source",
    });
  }
});

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
  facets?: InboxFacets | undefined;
  /** Open row, keyed as `sourceId:itemId` to match the master collection. */
  selected?: string | undefined;
  offset: number;
  limit: number;
}

/** Row identity for the workspace collection: one key the host can round-trip. */
export function inboxRowId(sourceId: string, itemId: string): string {
  return `${sourceId}:${itemId}`;
}

export function splitInboxRowId(
  rowId: string,
): { sourceId: string; itemId: string } | undefined {
  const separator = rowId.indexOf(":");
  if (separator <= 0 || separator === rowId.length - 1) return undefined;
  return {
    sourceId: rowId.slice(0, separator),
    itemId: rowId.slice(separator + 1),
  };
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
const inboxRowIdSchema = z.string().trim().min(3).max(400);

export const inboxWorkspaceQuerySchema: z.ZodType<
  InboxWorkspaceQueryValue,
  unknown
> = z
  .strictObject({
    sourceId: inboxIdSchema.optional(),
    urgency: inboxUrgencySchema.optional(),
    facets: inboxFacetsSchema.optional(),
    selected: inboxRowIdSchema.optional(),
    offset: inboxWorkspaceOffsetSchema.default(0),
    limit: inboxWorkspaceLimitSchema.default(50),
  })
  .superRefine((query, context) => {
    if (query.selected !== undefined && !splitInboxRowId(query.selected)) {
      context.addIssue({
        code: "custom",
        path: ["selected"],
        message: "Inbox selection must be a sourceId:itemId row key",
      });
    }
  });

function unknownRecord(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input))
    : {};
}

/** Normalize each URL/request field independently so one bad filter fails open. */
export function normalizeInboxWorkspaceQuery(
  input: unknown,
  sources: readonly InboxSource[],
): InboxWorkspaceQueryValue {
  const raw = unknownRecord(input);
  const sourceId = inboxIdSchema.safeParse(raw["sourceId"]);
  const source = sourceId.success
    ? sources.find((candidate) => candidate.sourceId === sourceId.data)
    : undefined;
  const urgency = inboxUrgencySchema.safeParse(raw["urgency"]);
  const offset = inboxWorkspaceOffsetSchema.safeParse(raw["offset"]);
  const limit = inboxWorkspaceLimitSchema.safeParse(raw["limit"]);
  const selected = inboxRowIdSchema.safeParse(raw["selected"]);
  const selection = selected.success
    ? splitInboxRowId(selected.data)
    : undefined;
  const selectedSource = selection
    ? sources.find((candidate) => candidate.sourceId === selection.sourceId)
    : undefined;
  const selectedItem = selection
    ? inboxItemIdSchema.safeParse(selection.itemId)
    : undefined;
  const flatFacets = Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) =>
      key.startsWith("facet.") ? [[key.slice(6), value]] : [],
    ),
  );
  const nestedFacets = unknownRecord(raw["facets"]);
  const facets = source
    ? normalizeDeclaredFacets(
        Object.keys(nestedFacets).length > 0 ? nestedFacets : flatFacets,
        source,
      )
    : undefined;
  return inboxWorkspaceQuerySchema.parse({
    ...(source ? { sourceId: source.sourceId } : {}),
    ...(urgency.success ? { urgency: urgency.data } : {}),
    ...(facets ? { facets } : {}),
    ...(selectedSource && selectedItem?.success
      ? { selected: inboxRowId(selectedSource.sourceId, selectedItem.data) }
      : {}),
    offset: offset.success ? offset.data : 0,
    limit: limit.success ? limit.data : 50,
  });
}

export function normalizeInboxListFilter(
  filter: InboxListFilterValue,
  sources: readonly InboxSource[],
): InboxListFilterValue {
  const source = filter.sourceId
    ? sources.find((candidate) => candidate.sourceId === filter.sourceId)
    : undefined;
  const facets =
    source && filter.facets
      ? normalizeDeclaredFacets(filter.facets, source)
      : undefined;
  return {
    ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
    ...(filter.urgency ? { urgency: filter.urgency } : {}),
    ...(facets ? { facets } : {}),
    limit: filter.limit,
  };
}

interface InboxSourceAvailabilityValue {
  source: InboxSourceDescriptor;
  open: number;
  high: number;
  available: boolean;
}

export const inboxSourceAvailabilitySchema: z.ZodType<
  InboxSourceAvailabilityValue,
  InboxSourceAvailabilityValue
> = z.strictObject({
  source: inboxSourceDescriptorSchema,
  open: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  available: z.boolean(),
});

type InboxWorkspaceItem = Omit<InboxItem, "followUps">;
const inboxWorkspaceItemSchema: z.ZodType<InboxWorkspaceItem, InboxItem> =
  inboxItemSchema.transform(({ followUps: _followUps, ...item }) => item);

interface InboxWorkspaceEntryValue {
  source: InboxSourceMetadata;
  item: InboxWorkspaceItem;
  detailAvailable: boolean;
  contactHref?: string | undefined;
  followUps: ResolvedInboxFollowUp[];
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
  item: inboxWorkspaceItemSchema,
  detailAvailable: z.boolean(),
  contactHref: inboxContactHrefSchema.optional(),
  followUps: z.array(resolvedInboxFollowUpSchema).max(100),
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

interface InboxDetailRequestValue {
  type: "detail";
  sourceId: string;
  itemId: string;
}

export const inboxDetailRequestSchema: z.ZodType<
  InboxDetailRequestValue,
  InboxDetailRequestValue
> = z.strictObject({
  type: z.literal("detail"),
  sourceId: inboxIdSchema,
  itemId: inboxItemIdSchema,
});

interface InboxDetailAvailableValue {
  kind: "detail";
  detail: InboxItemDetail;
}

interface InboxDetailUnavailableValue {
  kind: "detail-unavailable";
  error: "Original content is unavailable";
}

type InboxDetailOutcomeValue =
  InboxDetailAvailableValue | InboxDetailUnavailableValue;

export const inboxDetailOutcomeSchema: z.ZodType<
  InboxDetailOutcomeValue,
  InboxDetailOutcomeValue
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("detail"), detail: inboxItemDetailSchema }),
  z.strictObject({
    kind: z.literal("detail-unavailable"),
    error: z.literal("Original content is unavailable"),
  }),
]);

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

function normalizeDeclaredFacets(
  input: Record<string, unknown>,
  source: Pick<InboxSource, "facets">,
): InboxFacets | undefined {
  const selected = Object.fromEntries(
    (source.facets ?? []).flatMap((definition) => {
      const value = input[definition.key];
      return typeof value === "string" &&
        definition.values.some((option) => option.value === value)
        ? [[definition.key, value]]
        : [];
    }),
  );
  return Object.keys(selected).length > 0
    ? inboxFacetsSchema.parse(selected)
    : undefined;
}

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
export type InboxDetailRequest = z.output<typeof inboxDetailRequestSchema>;
export type InboxDetailOutcome = z.output<typeof inboxDetailOutcomeSchema>;
export type InboxActionOutcome = z.output<typeof inboxActionOutcomeSchema>;
export type InboxListToolOutput = z.output<typeof inboxListToolOutputSchema>;
