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
  type InboxSource,
  type ListToolOutputSchema,
} from "@brains/plugins";
import { queryInteger } from "@brains/utils/query";
import { z } from "@brains/utils/zod";

type InboxProjectionEntrySchema = z.ZodObject<
  { source: typeof inboxSourceMetadataSchema; item: typeof inboxItemSchema },
  z.core.$strict
>;

export const inboxProjectionEntrySchema: InboxProjectionEntrySchema =
  z.strictObject({
    source: inboxSourceMetadataSchema,
    item: inboxItemSchema,
  });

type InboxSourceErrorSchema = z.ZodObject<
  {
    source: typeof inboxSourceMetadataSchema;
    error: z.ZodLiteral<"Source unavailable">;
  },
  z.core.$strict
>;

export const inboxSourceErrorSchema: InboxSourceErrorSchema = z.strictObject({
  source: inboxSourceMetadataSchema,
  error: z.literal("Source unavailable"),
});

type InboxProjectionSchema = z.ZodObject<
  {
    entries: z.ZodArray<InboxProjectionEntrySchema>;
    errors: z.ZodArray<InboxSourceErrorSchema>;
  },
  z.core.$strict
>;

export const inboxProjectionSchema: InboxProjectionSchema = z.strictObject({
  entries: z.array(inboxProjectionEntrySchema).max(10_000),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
});

type InboxListFilterSchema = z.ZodObject<
  {
    sourceId: z.ZodOptional<typeof inboxIdSchema>;
    urgency: z.ZodOptional<typeof inboxUrgencySchema>;
    facets: z.ZodOptional<typeof inboxFacetsSchema>;
    limit: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
>;

export const inboxListFilterShape: InboxListFilterSchema["shape"] = {
  sourceId: inboxIdSchema.optional(),
  urgency: inboxUrgencySchema.optional(),
  facets: inboxFacetsSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

export const inboxListFilterSchema: InboxListFilterSchema = z
  .strictObject(inboxListFilterShape)
  .superRefine((filter, context) => {
    if (filter.facets !== undefined && filter.sourceId === undefined) {
      context.addIssue({
        code: "custom",
        path: ["sourceId"],
        message: "Inbox facet filters require a source",
      });
    }
  });

type InboxListItemSchema = z.ZodObject<
  {
    title: z.ZodString;
    summary: z.ZodOptional<z.ZodString>;
    contact: z.ZodOptional<typeof inboxContactSchema>;
    receivedAt: z.ZodISODateTime;
    urgency: typeof inboxUrgencySchema;
  },
  z.core.$strict
>;

export const inboxListItemSchema: InboxListItemSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_000).optional(),
  contact: inboxContactSchema.optional(),
  receivedAt: z.iso.datetime(),
  urgency: inboxUrgencySchema,
});

type InboxListEntrySchema = z.ZodObject<
  { source: typeof inboxSourceMetadataSchema; item: InboxListItemSchema },
  z.core.$strict
>;

export const inboxListEntrySchema: InboxListEntrySchema = z.strictObject({
  source: inboxSourceMetadataSchema,
  item: inboxListItemSchema,
});

type InboxListResultSchema = z.ZodObject<
  {
    entries: z.ZodArray<InboxListEntrySchema>;
    errors: z.ZodArray<InboxSourceErrorSchema>;
    total: z.ZodNumber;
  },
  z.core.$strict
>;

export const inboxListResultSchema: InboxListResultSchema = z.strictObject({
  entries: z.array(inboxListEntrySchema).max(100),
  errors: z.array(inboxSourceErrorSchema).max(1_000),
  total: z.number().int().nonnegative(),
});

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

type QueryIntegerSchema = z.ZodPreprocess<z.ZodNumber>;

const inboxWorkspaceOffsetSchema: QueryIntegerSchema = z.preprocess(
  queryInteger,
  z.number().int().min(0).max(10_000),
);
const inboxWorkspaceLimitSchema: QueryIntegerSchema = z.preprocess(
  queryInteger,
  z.number().int().min(1).max(100),
);
const inboxRowIdSchema: z.ZodString = z.string().trim().min(3).max(400);

type InboxWorkspaceQuerySchema = z.ZodObject<
  {
    sourceId: z.ZodOptional<typeof inboxIdSchema>;
    urgency: z.ZodOptional<typeof inboxUrgencySchema>;
    facets: z.ZodOptional<typeof inboxFacetsSchema>;
    /** Open row, keyed as `sourceId:itemId` to match the master collection. */
    selected: z.ZodOptional<typeof inboxRowIdSchema>;
    offset: z.ZodDefault<QueryIntegerSchema>;
    limit: z.ZodDefault<QueryIntegerSchema>;
  },
  z.core.$strict
>;

export const inboxWorkspaceQuerySchema: InboxWorkspaceQuerySchema = z
  .strictObject({
    sourceId: inboxIdSchema.optional(),
    urgency: inboxUrgencySchema.optional(),
    facets: inboxFacetsSchema.optional(),
    selected: inboxRowIdSchema.optional(),
    offset: inboxWorkspaceOffsetSchema.default(0),
    // A triage page is a screenful, not the whole backlog: paging is the
    // affordance that says more is behind it.
    limit: inboxWorkspaceLimitSchema.default(10),
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
): InboxWorkspaceQuery {
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
    limit: limit.success ? limit.data : 10,
  });
}

export function normalizeInboxListFilter(
  filter: InboxListFilter,
  sources: readonly InboxSource[],
): InboxListFilter {
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

type InboxSourceAvailabilitySchema = z.ZodObject<
  {
    source: typeof inboxSourceDescriptorSchema;
    open: z.ZodNumber;
    high: z.ZodNumber;
    available: z.ZodBoolean;
  },
  z.core.$strict
>;

export const inboxSourceAvailabilitySchema: InboxSourceAvailabilitySchema =
  z.strictObject({
    source: inboxSourceDescriptorSchema,
    open: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    available: z.boolean(),
  });

type InboxWorkspaceItem = Omit<InboxItem, "followUps">;
const inboxWorkspaceItemSchema: z.ZodPipe<
  typeof inboxItemSchema,
  z.ZodTransform<InboxWorkspaceItem, InboxItem>
> = inboxItemSchema.transform(({ followUps: _followUps, ...item }) => item);

const inboxContactHrefSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(isSafeSameOriginPath, { message: "Invalid contact target" });

type InboxWorkspaceEntrySchema = z.ZodObject<
  {
    source: typeof inboxSourceMetadataSchema;
    item: typeof inboxWorkspaceItemSchema;
    detailAvailable: z.ZodBoolean;
    contactHref: z.ZodOptional<typeof inboxContactHrefSchema>;
    followUps: z.ZodArray<typeof resolvedInboxFollowUpSchema>;
  },
  z.core.$strict
>;

export const inboxWorkspaceEntrySchema: InboxWorkspaceEntrySchema =
  z.strictObject({
    source: inboxSourceMetadataSchema,
    item: inboxWorkspaceItemSchema,
    detailAvailable: z.boolean(),
    contactHref: inboxContactHrefSchema.optional(),
    followUps: z.array(resolvedInboxFollowUpSchema).max(100),
  });

type InboxWorkspaceSnapshotSchema = z.ZodObject<
  {
    summary: z.ZodObject<
      { open: z.ZodNumber; high: z.ZodNumber },
      z.core.$strict
    >;
    sources: z.ZodArray<InboxSourceAvailabilitySchema>;
    entries: z.ZodArray<InboxWorkspaceEntrySchema>;
    selectedEntry: z.ZodOptional<InboxWorkspaceEntrySchema>;
    errors: z.ZodArray<InboxSourceErrorSchema>;
    total: z.ZodNumber;
    offset: z.ZodNumber;
    limit: z.ZodNumber;
  },
  z.core.$strict
>;

export const inboxWorkspaceSnapshotSchema: InboxWorkspaceSnapshotSchema =
  z.strictObject({
    summary: z.strictObject({
      open: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
    }),
    sources: z.array(inboxSourceAvailabilitySchema).max(1_000),
    entries: z.array(inboxWorkspaceEntrySchema).max(100),
    /** Open item metadata retained when paging moves its row out of the window. */
    selectedEntry: inboxWorkspaceEntrySchema.optional(),
    errors: z.array(inboxSourceErrorSchema).max(1_000),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
  });

type InboxDashboardEntrySchema = z.ZodObject<
  {
    sourceLabel: z.ZodString;
    urgency: typeof inboxUrgencySchema;
    title: z.ZodString;
    receivedAt: z.ZodISODateTime;
  },
  z.core.$strict
>;

export const inboxDashboardEntrySchema: InboxDashboardEntrySchema =
  z.strictObject({
    sourceLabel: z.string().trim().min(1).max(200),
    urgency: inboxUrgencySchema,
    title: z.string().trim().min(1).max(500),
    receivedAt: z.iso.datetime(),
  });

type InboxDashboardDataSchema = z.ZodObject<
  {
    summary: z.ZodObject<
      {
        open: z.ZodNumber;
        high: z.ZodNumber;
        availableSources: z.ZodNumber;
        unavailableSources: z.ZodNumber;
      },
      z.core.$strict
    >;
    entries: z.ZodArray<InboxDashboardEntrySchema>;
  },
  z.core.$strict
>;

export const inboxDashboardDataSchema: InboxDashboardDataSchema =
  z.strictObject({
    summary: z.strictObject({
      open: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      availableSources: z.number().int().nonnegative(),
      unavailableSources: z.number().int().nonnegative(),
    }),
    entries: z.array(inboxDashboardEntrySchema).max(5),
  });

type InboxActionRequestSchema = z.ZodObject<
  {
    sourceId: z.ZodString;
    itemId: z.ZodString;
    actionId: z.ZodString;
    confirmed: z.ZodDefault<z.ZodBoolean>;
  },
  z.core.$strict
>;

export const inboxActionRequestSchema: InboxActionRequestSchema =
  z.strictObject({
    sourceId: inboxIdSchema,
    itemId: inboxItemIdSchema,
    actionId: inboxIdSchema,
    confirmed: z.boolean().default(false),
  });

type InboxDetailRequestSchema = z.ZodObject<
  {
    type: z.ZodLiteral<"detail">;
    sourceId: z.ZodString;
    itemId: z.ZodString;
  },
  z.core.$strict
>;

export const inboxDetailRequestSchema: InboxDetailRequestSchema =
  z.strictObject({
    type: z.literal("detail"),
    sourceId: inboxIdSchema,
    itemId: inboxItemIdSchema,
  });

type InboxDetailOutcomeSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { kind: z.ZodLiteral<"detail">; detail: typeof inboxItemDetailSchema },
      z.core.$strict
    >,
    z.ZodObject<
      {
        kind: z.ZodLiteral<"detail-unavailable">;
        error: z.ZodLiteral<"Original content is unavailable">;
      },
      z.core.$strict
    >,
  ]
>;

export const inboxDetailOutcomeSchema: InboxDetailOutcomeSchema =
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("detail"),
      detail: inboxItemDetailSchema,
    }),
    z.strictObject({
      kind: z.literal("detail-unavailable"),
      error: z.literal("Original content is unavailable"),
    }),
  ]);

type InboxActionConfirmationSchema = z.ZodObject<
  { kind: z.ZodLiteral<"confirmation">; summary: z.ZodString },
  z.core.$strict
>;

export const inboxActionConfirmationSchema: InboxActionConfirmationSchema =
  z.strictObject({
    kind: z.literal("confirmation"),
    summary: z.string().min(1).max(300),
  });

type InboxActionCompletedSchema = z.ZodObject<
  { kind: z.ZodLiteral<"completed"> },
  z.core.$strict
>;

export const inboxActionCompletedSchema: InboxActionCompletedSchema =
  z.strictObject({
    kind: z.literal("completed"),
  });

type InboxActionErrorSchema = z.ZodObject<
  {
    kind: z.ZodLiteral<"error">;
    error: z.ZodEnum<{
      "Invalid inbox action": "Invalid inbox action";
      "Inbox action failed": "Inbox action failed";
    }>;
  },
  z.core.$strict
>;

export const inboxActionErrorSchema: InboxActionErrorSchema = z.strictObject({
  kind: z.literal("error"),
  error: z.enum(["Invalid inbox action", "Inbox action failed"]),
});

export const inboxActionOutcomeSchema: z.ZodUnion<
  [
    InboxActionConfirmationSchema,
    InboxActionCompletedSchema,
    InboxActionErrorSchema,
  ]
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

export const inboxListToolOutputSchema: ListToolOutputSchema<InboxListResultSchema> =
  createListToolOutputSchema(inboxListResultSchema);

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
