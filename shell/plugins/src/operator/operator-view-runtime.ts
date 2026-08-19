import type { JsonValue } from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import type { OperatorEntityCatalogDefinition } from "./operator-view-contract";
import type { AnyWorkspaceActionDefinition } from "./workspace-action-definition-contract";
import { meetsPermission } from "./contract-assertions";
import { z } from "@brains/utils/zod";

export type RuntimeOperatorScalar = string | number | boolean | null;
export type RuntimeOperatorTone = "good" | "warn" | "neutral" | "error";

export type RuntimeOperatorLaunchIntent =
  | { readonly target: "account-settings" }
  | {
      readonly target: "admin-peer-invite";
      readonly peerId: string;
      readonly displayName: string;
    }
  | { readonly target: "inbox" }
  | {
      readonly target: "inbox";
      readonly source: "mail";
      readonly filter?:
        "high-priority" | "needs-reply" | "unclassified" | undefined;
    }
  | { readonly target: "publishing" }
  | { readonly target: "site" }
  | {
      readonly target: "inbox-open-entity";
      readonly entityType: string;
      readonly entityId: string;
    }
  | {
      readonly target: "inbox-capture-note";
      readonly title: string;
      readonly summary?: string | undefined;
      readonly entityType: string;
      readonly entityId: string;
    }
  | {
      readonly target: "inbox-discuss-in-chat";
      readonly sourceId: string;
      readonly itemId: string;
      readonly label: string;
    };

export type RuntimeOperatorLinkTarget =
  | { readonly kind: "external"; readonly href: string }
  | {
      readonly kind: "entity";
      readonly entityType: string;
      readonly id: string;
    }
  | {
      readonly kind: "launch";
      readonly launch: RuntimeOperatorLaunchIntent;
    }
  /**
   * Opens a row of the enclosing detail block's master. The enclosing block is
   * known lexically, so the target names no block and cannot dangle across the
   * view.
   */
  | {
      readonly kind: "detail";
      readonly itemId: string;
    };

export interface RuntimeOperatorStatItem {
  readonly label: string;
  readonly value: string | number;
  readonly caption?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorStatsBlock {
  readonly type: "stats";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorStatItem[];
}

export interface RuntimeOperatorKeyValueItem {
  readonly label: string;
  readonly value: RuntimeOperatorScalar;
}

export interface RuntimeOperatorKeyValuesBlock {
  readonly type: "key-values";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorKeyValueItem[];
}

export interface RuntimeOperatorNoticeBlock {
  readonly type: "notice";
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly text: string;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorTextBlock {
  readonly type: "text";
  readonly id?: string | undefined;
  readonly label?: string | undefined;
  readonly text: string;
  readonly truncated?: boolean | undefined;
}

export interface RuntimeOperatorGroupItem {
  readonly id: string;
  readonly label: string;
  readonly value?: RuntimeOperatorScalar | undefined;
  readonly description?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorGroupBlock {
  readonly type: "group";
  readonly id: string;
  readonly label: string;
  readonly items: readonly RuntimeOperatorGroupItem[];
}

export interface RuntimeOperatorFlowStep {
  readonly id: string;
  readonly label: string;
  readonly status: "idle" | "active" | "complete" | "failed";
  readonly detail?: string | undefined;
}

export interface RuntimeOperatorFlowBlock {
  readonly type: "flow";
  readonly id: string;
  readonly label: string;
  readonly direction?: "forward" | "bidirectional" | undefined;
  readonly steps: readonly RuntimeOperatorFlowStep[];
}

export interface RuntimeOperatorMeterItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly max?: number | undefined;
  readonly unit?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorMeterBlock {
  readonly type: "meters";
  readonly id: string;
  readonly items: readonly RuntimeOperatorMeterItem[];
}

export interface RuntimeOperatorProgressBlock {
  readonly type: "progress";
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly detail?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly progress?: number | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorQueryOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | undefined;
}

export interface RuntimeOperatorQueryBlock {
  readonly type: "query";
  readonly id: string;
  readonly controls: readonly {
    readonly key: string;
    readonly label: string;
    readonly value?: string | undefined;
    readonly allLabel?: string | undefined;
    readonly options: readonly RuntimeOperatorQueryOption[];
  }[];
  readonly pagination?:
    | {
        readonly offset: number;
        readonly limit: number;
        readonly total: number;
        readonly label?: string | undefined;
      }
    | undefined;
}

export interface RuntimeOperatorLinkItem {
  readonly label: string;
  readonly target: RuntimeOperatorLinkTarget;
}

export interface RuntimeOperatorLinksBlock {
  readonly type: "links";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorLinkItem[];
}

export interface RuntimeOperatorBadge {
  readonly label: string;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorListItem {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly meta?: string | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly count?: number | undefined;
  readonly badges?: readonly RuntimeOperatorBadge[] | undefined;
  readonly filterValues?: readonly string[] | undefined;
  readonly links?: readonly RuntimeOperatorLinkItem[] | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
  readonly link?: RuntimeOperatorLinkTarget | undefined;
}

export interface RuntimeOperatorListFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly emphasis?: "gap" | undefined;
}

export interface RuntimeOperatorListFilter {
  readonly label: string;
  readonly defaultValue: string;
  readonly allValue?: string | undefined;
  readonly options: readonly RuntimeOperatorListFilterOption[];
}

export interface RuntimeOperatorListBlock {
  readonly type: "list";
  readonly id: string;
  readonly empty: string;
  readonly filter?: RuntimeOperatorListFilter | undefined;
  readonly items: readonly RuntimeOperatorListItem[];
}

export interface RuntimeOperatorTableColumn {
  readonly key: string;
  readonly label: string;
  readonly align?: "start" | "center" | "end" | undefined;
}

export interface RuntimeOperatorTableFilter {
  readonly key: string;
  readonly label: string;
  readonly values: readonly RuntimeOperatorScalar[];
}

export interface RuntimeOperatorTableRow {
  readonly id: string;
  readonly cells: Readonly<
    Record<string, RuntimeOperatorScalar | readonly string[]>
  >;
  readonly link?: RuntimeOperatorLinkTarget | undefined;
}

export interface RuntimeOperatorTableBlock {
  readonly type: "table";
  readonly id: string;
  readonly empty: string;
  readonly filters?: readonly RuntimeOperatorTableFilter[] | undefined;
  readonly columns: readonly RuntimeOperatorTableColumn[];
  readonly rows: readonly RuntimeOperatorTableRow[];
}

export interface RuntimeOperatorMatrixCell<
  TItem extends RuntimeOperatorListItem = RuntimeOperatorListItem,
> {
  readonly id: string;
  readonly label: string;
  readonly tone?: RuntimeOperatorTone | undefined;
  readonly empty: string;
  readonly items: readonly TItem[];
}

export interface RuntimeOperatorMatrixBlock<
  TItem extends RuntimeOperatorListItem = RuntimeOperatorListItem,
> {
  readonly type: "matrix";
  readonly id: string;
  readonly columns?: 1 | 2 | 3 | 4 | undefined;
  readonly cells: readonly RuntimeOperatorMatrixCell<TItem>[];
}

export interface RuntimeOperatorSpatialLegendItem {
  readonly label: string;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorSpatialRelationship {
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
}

export interface RuntimeOperatorCartesianPoint {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly x: number;
  readonly y: number;
  readonly zoneId?: string | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
  readonly details?: readonly string[] | undefined;
}

export interface RuntimeOperatorCartesianZone {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly memberIds: readonly string[];
}

export interface RuntimeOperatorCartesianSpatialBlock {
  readonly type: "spatial";
  readonly layout: "cartesian";
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly points: readonly RuntimeOperatorCartesianPoint[];
  readonly zones: readonly RuntimeOperatorCartesianZone[];
  readonly relationships?:
    readonly RuntimeOperatorSpatialRelationship[] | undefined;
  readonly legend: readonly RuntimeOperatorSpatialLegendItem[];
}

export interface RuntimeOperatorRadialPoint {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly status: string;
  readonly tags?: readonly string[] | undefined;
  readonly distance: number;
  readonly bearing: number;
  readonly relatedIds?: readonly string[] | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
  readonly details?: readonly string[] | undefined;
}

export interface RuntimeOperatorSpatialCluster {
  readonly id: string;
  readonly label: string;
  readonly memberIds: readonly string[];
}

export interface RuntimeOperatorRadialStratum {
  readonly id: string;
  readonly label: string;
  readonly maxDistance: number;
}

export interface RuntimeOperatorRadialSpatialBlock {
  readonly type: "spatial";
  readonly layout: "radial";
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly centerLabel: string;
  readonly centerKind: "identity" | "centroid";
  readonly points: readonly RuntimeOperatorRadialPoint[];
  readonly clusters?: readonly RuntimeOperatorSpatialCluster[] | undefined;
  readonly relationships?:
    readonly RuntimeOperatorSpatialRelationship[] | undefined;
  readonly strata: readonly RuntimeOperatorRadialStratum[];
  readonly legend: readonly RuntimeOperatorSpatialLegendItem[];
}

export type RuntimeOperatorSpatialBlock =
  RuntimeOperatorCartesianSpatialBlock | RuntimeOperatorRadialSpatialBlock;

export type RuntimeDashboardOperatorPanelBlock =
  | RuntimeOperatorStatsBlock
  | RuntimeOperatorKeyValuesBlock
  | RuntimeOperatorNoticeBlock
  | RuntimeOperatorGroupBlock
  | RuntimeOperatorFlowBlock
  | RuntimeOperatorMeterBlock
  | RuntimeOperatorProgressBlock
  | RuntimeOperatorLinksBlock
  | RuntimeOperatorListBlock
  | RuntimeOperatorTableBlock
  | RuntimeOperatorMatrixBlock
  | RuntimeOperatorSpatialBlock;

export interface RuntimeDashboardOperatorTabsBlock {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  readonly tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly count?: number | undefined;
    readonly blocks: readonly RuntimeDashboardOperatorPanelBlock[];
  }[];
}

export type RuntimeDashboardOperatorBlock =
  RuntimeDashboardOperatorPanelBlock | RuntimeDashboardOperatorTabsBlock;

export interface RuntimeDashboardOperatorView {
  readonly title?: string | undefined;
  readonly blocks: readonly RuntimeDashboardOperatorBlock[];
}

export interface RuntimePreparedConfirmation {
  readonly kind: "prepared-confirmation";
  readonly token: string;
  readonly summary: string;
  readonly expiresAt: string;
}

export interface RuntimeOperatorActionControl {
  readonly actionId: string;
  readonly capabilityId?: string | undefined;
  readonly label: string;
  readonly input: JsonValue;
  readonly disabled?: boolean | undefined;
  readonly confirmation?:
    | { readonly kind: "static"; readonly message: string }
    | { readonly kind: "prepared" }
    | undefined;
  /** Host-only action transport state; never accepted from an author view. */
  readonly invocation?:
    | { readonly mode: "prepare" }
    | { readonly mode: "execute"; readonly token: string }
    | undefined;
}

export interface RuntimeCmsOperatorListItem extends RuntimeOperatorListItem {
  readonly actions?: readonly RuntimeOperatorActionControl[] | undefined;
}

export interface RuntimeCmsOperatorListBlock extends Omit<
  RuntimeOperatorListBlock,
  "items"
> {
  readonly items: readonly RuntimeCmsOperatorListItem[];
}

export interface RuntimeCmsOperatorTableRow extends RuntimeOperatorTableRow {
  readonly actions?: readonly RuntimeOperatorActionControl[] | undefined;
}

export interface RuntimeCmsOperatorTableBlock extends Omit<
  RuntimeOperatorTableBlock,
  "rows"
> {
  readonly rows: readonly RuntimeCmsOperatorTableRow[];
}

export interface RuntimeCmsOperatorActionBlock extends RuntimeOperatorActionControl {
  readonly type: "action";
  readonly id?: string | undefined;
}

export interface RuntimeCmsOperatorActionsBlock {
  readonly type: "actions";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorActionControl[];
}

export type RuntimeCmsOperatorPanelBlock =
  | RuntimeOperatorStatsBlock
  | RuntimeOperatorKeyValuesBlock
  | RuntimeOperatorNoticeBlock
  | RuntimeOperatorTextBlock
  | RuntimeOperatorGroupBlock
  | RuntimeOperatorFlowBlock
  | RuntimeOperatorMeterBlock
  | RuntimeOperatorProgressBlock
  | RuntimeOperatorQueryBlock
  | RuntimeOperatorLinksBlock
  | RuntimeCmsOperatorListBlock
  | RuntimeCmsOperatorTableBlock
  | RuntimeOperatorMatrixBlock<RuntimeCmsOperatorListItem>
  | RuntimeOperatorSpatialBlock
  | RuntimeCmsOperatorActionBlock
  | RuntimeCmsOperatorActionsBlock;

export interface RuntimeCmsOperatorTabsBlock {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  readonly tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly count?: number | undefined;
    readonly blocks: readonly RuntimeCmsOperatorPanelBlock[];
  }[];
}

export interface RuntimeCmsOperatorDetailBlock {
  readonly type: "detail";
  readonly id: string;
  readonly queryKey: string;
  readonly empty: string;
  readonly master: RuntimeCmsOperatorListBlock | RuntimeCmsOperatorTableBlock;
  readonly open?:
    | {
        readonly forId: string;
        readonly title: string;
        readonly blocks: readonly RuntimeCmsOperatorRegionBlock[];
      }
    | undefined;
}

export interface RuntimeCmsOperatorCardBlock {
  readonly type: "card";
  readonly id: string;
  readonly label: string;
  readonly tone?: "good" | "warn" | "neutral" | "error" | undefined;
  readonly blocks: readonly RuntimeCmsOperatorPanelBlock[];
}

export type RuntimeCmsOperatorRegionBlock =
  RuntimeCmsOperatorPanelBlock | RuntimeCmsOperatorCardBlock;

export interface RuntimeCmsOperatorColumnsBlock {
  readonly type: "columns";
  readonly id: string;
  readonly primary: readonly RuntimeCmsOperatorRegionBlock[];
  readonly aside: readonly RuntimeCmsOperatorRegionBlock[];
}

export type RuntimeCmsOperatorBlock =
  | RuntimeCmsOperatorPanelBlock
  | RuntimeCmsOperatorTabsBlock
  | RuntimeCmsOperatorDetailBlock
  | RuntimeCmsOperatorColumnsBlock
  | RuntimeCmsOperatorCardBlock;

export interface RuntimeCmsOperatorViewStatus {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly tone?: "good" | "warn" | "neutral" | "error" | undefined;
}

export interface RuntimeCmsOperatorView {
  readonly kicker?: string | undefined;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly status?: RuntimeCmsOperatorViewStatus | undefined;
  readonly blocks: readonly RuntimeCmsOperatorBlock[];
}

export interface RuntimeCmsWorkspaceData {
  readonly view: RuntimeCmsOperatorView;
  readonly refreshAfterMs?: number | undefined;
}

export interface RuntimeDashboardDigest {
  readonly items: readonly {
    readonly label: string;
    readonly value: string;
    readonly tone?: "good" | "warn" | undefined;
  }[];
  readonly attention?: number | undefined;
}

export interface RuntimeDashboardWidgetData {
  readonly view: RuntimeDashboardOperatorView;
  readonly digest?: RuntimeDashboardDigest | undefined;
}

export interface RuntimeOperatorValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type RuntimeOperatorParseResult<T> =
  | { readonly success: true; readonly data: T }
  | {
      readonly success: false;
      readonly issues: readonly RuntimeOperatorValidationIssue[];
    };

const identifierSchema = z.string().trim().min(1).max(120);
/**
 * Row identity is opaque data, not an authored name: a collection row may be
 * keyed by a composite source identity, so it is bounded more loosely than the
 * identifiers an author chooses.
 */
const rowIdentifierSchema = z.string().trim().min(1).max(400);
const labelSchema = z.string().trim().min(1).max(160);
const shortTextSchema = z.string().max(500);
const textSchema = z.string().max(4_000);
const longTextSchema = z.string().max(100_000);
const toneSchema = z.enum(["good", "warn", "neutral", "error"]);
const scalarSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const safeExternalUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "External operator links must use http or https" },
  );

function isEntityDefinition(value: unknown): value is AnyEntityDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-entity" &&
    "type" in value &&
    typeof value.type === "string" &&
    value.type.length > 0
  );
}

const entityDefinitionSchema = z.custom<AnyEntityDefinition>(
  isEntityDefinition,
  { message: "Expected an imported entity definition" },
);

function isEntityCatalogDefinition(
  value: unknown,
): value is OperatorEntityCatalogDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-entity-catalog" &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string"
  );
}

const entityCatalogDefinitionSchema = z.custom<OperatorEntityCatalogDefinition>(
  isEntityCatalogDefinition,
  { message: "Expected an imported entity catalog definition" },
);

function externalLinkTarget(input: {
  readonly external: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "external", href: input.external };
}

function entityLinkTarget(input: {
  readonly entity: AnyEntityDefinition;
  readonly id: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "entity", entityType: input.entity.type, id: input.id };
}

const launchIntentSchema = z.union([
  z.object({ target: z.literal("account-settings") }).strict(),
  z
    .object({
      target: z.literal("admin-peer-invite"),
      peerId: identifierSchema,
      displayName: labelSchema,
    })
    .strict(),
  z.object({ target: z.literal("inbox") }).strict(),
  z
    .object({
      target: z.literal("inbox"),
      source: z.literal("mail"),
      filter: z
        .enum(["high-priority", "needs-reply", "unclassified"])
        .optional(),
    })
    .strict(),
  z.object({ target: z.literal("publishing") }).strict(),
  z.object({ target: z.literal("site") }).strict(),
  z
    .object({
      target: z.literal("inbox-open-entity"),
      entityType: identifierSchema,
      entityId: identifierSchema,
    })
    .strict(),
  z
    .object({
      target: z.literal("inbox-capture-note"),
      title: shortTextSchema,
      summary: z.string().trim().min(1).max(1_000).optional(),
      entityType: identifierSchema,
      entityId: identifierSchema,
    })
    .strict(),
  z
    .object({
      target: z.literal("inbox-discuss-in-chat"),
      sourceId: identifierSchema,
      itemId: z.string().trim().min(1).max(300),
      label: z.string().trim().min(1).max(160),
    })
    .strict(),
]);

function catalogEntityLinkTarget(input: {
  readonly catalog: OperatorEntityCatalogDefinition;
  readonly entityType: string;
  readonly id: string;
}): RuntimeOperatorLinkTarget {
  return { kind: "entity", entityType: input.entityType, id: input.id };
}

function launchLinkTarget(input: {
  readonly launch: RuntimeOperatorLaunchIntent;
}): RuntimeOperatorLinkTarget {
  return { kind: "launch", launch: input.launch };
}

function detailLinkTarget(input: {
  readonly detail: { readonly itemId: string };
}): RuntimeOperatorLinkTarget {
  return { kind: "detail", itemId: input.detail.itemId };
}

const linkTargetSchema: z.ZodType<RuntimeOperatorLinkTarget, unknown> = z.union(
  [
    z
      .object({ external: safeExternalUrlSchema })
      .strict()
      .transform(externalLinkTarget),
    z
      .object({ entity: entityDefinitionSchema, id: identifierSchema })
      .strict()
      .transform(entityLinkTarget),
    z
      .object({
        catalog: entityCatalogDefinitionSchema,
        entityType: identifierSchema,
        id: identifierSchema,
      })
      .strict()
      .transform(catalogEntityLinkTarget),
    z
      .object({ launch: launchIntentSchema })
      .strict()
      .transform(launchLinkTarget),
    z
      .object({ detail: z.object({ itemId: rowIdentifierSchema }).strict() })
      .strict()
      .transform(detailLinkTarget),
    z
      .object({ kind: z.literal("external"), href: safeExternalUrlSchema })
      .strict(),
    z
      .object({
        kind: z.literal("entity"),
        entityType: identifierSchema,
        id: identifierSchema,
      })
      .strict(),
    z
      .object({ kind: z.literal("launch"), launch: launchIntentSchema })
      .strict(),
    z
      .object({ kind: z.literal("detail"), itemId: rowIdentifierSchema })
      .strict(),
  ],
);

const statItemSchema = z
  .object({
    label: labelSchema,
    value: z.union([z.string().max(500), z.number().finite()]),
    /** What the number counts, under the value. */
    caption: shortTextSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict();

const keyValueItemSchema = z
  .object({ label: labelSchema, value: scalarSchema })
  .strict();

const statsBlockSchema = z
  .object({
    type: z.literal("stats"),
    id: identifierSchema.optional(),
    items: z.array(statItemSchema).max(20),
  })
  .strict();

const keyValuesBlockSchema = z
  .object({
    type: z.literal("key-values"),
    id: identifierSchema.optional(),
    items: z.array(keyValueItemSchema).max(40),
  })
  .strict();

const noticeBlockSchema = z
  .object({
    type: z.literal("notice"),
    id: identifierSchema.optional(),
    title: labelSchema.optional(),
    text: textSchema,
    tone: toneSchema.optional(),
  })
  .strict();

const textBlockSchema = z
  .object({
    type: z.literal("text"),
    id: identifierSchema.optional(),
    label: labelSchema.optional(),
    text: longTextSchema,
    truncated: z.boolean().optional(),
  })
  .strict();

const groupItemSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    value: scalarSchema.optional(),
    description: textSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict();
const groupBlockSchema = z
  .object({
    type: z.literal("group"),
    id: identifierSchema,
    label: labelSchema,
    items: z.array(groupItemSchema).max(50),
  })
  .strict();
const flowStepSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    status: z.enum(["idle", "active", "complete", "failed"]),
    detail: shortTextSchema.optional(),
  })
  .strict();
const flowBlockSchema = z
  .object({
    type: z.literal("flow"),
    id: identifierSchema,
    label: labelSchema,
    direction: z.enum(["forward", "bidirectional"]).optional(),
    steps: z.array(flowStepSchema).min(2).max(20),
  })
  .strict();
const meterItemSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    value: z.number().finite().nonnegative(),
    max: z.number().finite().positive().optional(),
    unit: labelSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.max !== undefined && item.value > item.max) {
      context.addIssue({
        code: "custom",
        message: "Meter value cannot exceed its maximum",
        path: ["value"],
      });
    }
  });
const meterBlockSchema = z
  .object({
    type: z.literal("meters"),
    id: identifierSchema,
    items: z.array(meterItemSchema).max(30),
  })
  .strict();
const progressBlockSchema = z
  .object({
    type: z.literal("progress"),
    id: identifierSchema,
    label: labelSchema,
    state: labelSchema,
    detail: textSchema.optional(),
    startedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    progress: z.number().finite().min(0).max(1).optional(),
    tone: toneSchema.optional(),
  })
  .strict();

const queryKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-zA-Z0-9_.-]*$/);
const queryOptionSchema = z
  .object({
    value: labelSchema,
    label: labelSchema,
    count: z.number().int().nonnegative().optional(),
  })
  .strict();
const queryControlSchema = z
  .object({
    key: queryKeySchema,
    label: labelSchema,
    value: labelSchema.optional(),
    allLabel: labelSchema.optional(),
    options: z.array(queryOptionSchema).max(100),
  })
  .strict();
const queryBlockSchema = z
  .object({
    type: z.literal("query"),
    id: identifierSchema,
    controls: z.array(queryControlSchema).max(20),
    pagination: z
      .object({
        offset: z.number().int().nonnegative(),
        limit: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
        label: labelSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((block, context) => {
    const keys = new Set<string>();
    for (const [index, control] of block.controls.entries()) {
      if (keys.has(control.key)) {
        context.addIssue({
          code: "custom",
          message: `Query key "${control.key}" is duplicated`,
          path: ["controls", index, "key"],
        });
      }
      keys.add(control.key);
    }
  });

const linksBlockSchema = z
  .object({
    type: z.literal("links"),
    id: identifierSchema.optional(),
    items: z
      .array(
        z.object({ label: labelSchema, target: linkTargetSchema }).strict(),
      )
      .max(30),
  })
  .strict();

const badgeSchema = z
  .object({ label: labelSchema, tone: toneSchema.optional() })
  .strict();
const listFilterOptionSchema = z
  .object({
    value: identifierSchema,
    label: labelSchema,
    count: z.number().int().nonnegative().optional(),
    emphasis: z.literal("gap").optional(),
  })
  .strict();
const listFilterSchema = z
  .object({
    label: labelSchema,
    defaultValue: identifierSchema,
    allValue: identifierSchema.optional(),
    options: z.array(listFilterOptionSchema).min(1).max(50),
  })
  .strict()
  .superRefine((filter, context) => {
    const values = new Set<string>();
    for (const [index, option] of filter.options.entries()) {
      if (values.has(option.value)) {
        context.addIssue({
          code: "custom",
          message: `List filter value "${option.value}" is duplicated`,
          path: ["options", index, "value"],
        });
      }
      values.add(option.value);
    }
    if (!values.has(filter.defaultValue)) {
      context.addIssue({
        code: "custom",
        message: `List filter default "${filter.defaultValue}" has no matching option`,
        path: ["defaultValue"],
      });
    }
  });

const listItemSchema = z
  .object({
    id: rowIdentifierSchema,
    title: shortTextSchema,
    description: textSchema.optional(),
    meta: shortTextSchema.optional(),
    metadata: z.array(shortTextSchema).max(20).optional(),
    tags: z.array(labelSchema).max(30).optional(),
    count: z.number().finite().optional(),
    badges: z.array(badgeSchema).max(10).optional(),
    filterValues: z.array(identifierSchema).max(50).optional(),
    links: z
      .array(
        z.object({ label: labelSchema, target: linkTargetSchema }).strict(),
      )
      .max(10)
      .optional(),
    tone: toneSchema.optional(),
    link: linkTargetSchema.optional(),
  })
  .strict();

const listBlockSchema = z
  .object({
    type: z.literal("list"),
    id: identifierSchema,
    empty: shortTextSchema,
    filter: listFilterSchema.optional(),
    items: z.array(listItemSchema).max(200),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, item] of block.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `List item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
    if (block.filter) {
      const optionValues = new Set(
        block.filter.options.map((option) => option.value),
      );
      const allValue = block.filter.allValue ?? "all";
      for (const [index, item] of block.items.entries()) {
        for (const value of item.filterValues ?? []) {
          if (value !== allValue && !optionValues.has(value)) {
            context.addIssue({
              code: "custom",
              message: `List item filter value "${value}" has no matching option`,
              path: ["items", index, "filterValues"],
            });
          }
        }
      }
    }
  });

const tableColumnSchema = z
  .object({
    key: identifierSchema,
    label: labelSchema,
    align: z.enum(["start", "center", "end"]).optional(),
  })
  .strict();
const tableFilterSchema = z
  .object({
    key: identifierSchema,
    label: labelSchema,
    values: z.array(scalarSchema).max(50),
  })
  .strict();
const tableCellSchema = z.union([
  scalarSchema,
  z.array(z.string().max(500)).max(50),
]);
const tableRowSchema = z
  .object({
    id: rowIdentifierSchema,
    cells: z.record(z.string(), tableCellSchema),
    link: linkTargetSchema.optional(),
  })
  .strict();

const tableBlockSchema = z
  .object({
    type: z.literal("table"),
    id: identifierSchema,
    empty: shortTextSchema,
    filters: z.array(tableFilterSchema).max(20).optional(),
    columns: z.array(tableColumnSchema).min(1).max(30),
    rows: z.array(tableRowSchema).max(500),
  })
  .strict()
  .superRefine((block, context) => {
    const columnKeys = new Set<string>();
    for (const [index, column] of block.columns.entries()) {
      if (columnKeys.has(column.key)) {
        context.addIssue({
          code: "custom",
          message: `Table column key "${column.key}" is duplicated`,
          path: ["columns", index, "key"],
        });
      }
      columnKeys.add(column.key);
    }
    for (const [index, filter] of (block.filters ?? []).entries()) {
      if (!columnKeys.has(filter.key)) {
        context.addIssue({
          code: "custom",
          message: `Table filter key "${filter.key}" has no matching column`,
          path: ["filters", index, "key"],
        });
      }
    }
    const rowIds = new Set<string>();
    for (const [rowIndex, row] of block.rows.entries()) {
      if (rowIds.has(row.id)) {
        context.addIssue({
          code: "custom",
          message: `Table row id "${row.id}" is duplicated`,
          path: ["rows", rowIndex, "id"],
        });
      }
      rowIds.add(row.id);
      for (const key of Object.keys(row.cells)) {
        if (!columnKeys.has(key)) {
          context.addIssue({
            code: "custom",
            message: `Table cell key "${key}" has no matching column`,
            path: ["rows", rowIndex, "cells", key],
          });
        }
      }
    }
  });

const matrixCellSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    tone: toneSchema.optional(),
    empty: shortTextSchema,
    items: z.array(listItemSchema).max(100),
  })
  .strict()
  .superRefine((cell, context) => {
    const ids = new Set<string>();
    for (const [index, item] of cell.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
  });
const matrixBlockSchema = z
  .object({
    type: z.literal("matrix"),
    id: identifierSchema,
    columns: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    cells: z.array(matrixCellSchema).min(1).max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, cell] of block.cells.entries()) {
      if (ids.has(cell.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix cell id "${cell.id}" is duplicated`,
          path: ["cells", index, "id"],
        });
      }
      ids.add(cell.id);
    }
  });

const spatialLegendItemSchema = z
  .object({ label: labelSchema, tone: toneSchema.optional() })
  .strict();
const spatialRelationshipSchema = z
  .object({
    sourceId: identifierSchema,
    targetId: identifierSchema,
    label: labelSchema.optional(),
    tone: toneSchema.optional(),
  })
  .strict();
const coordinateSchema = z.number().finite().min(0).max(1);
const cartesianPointSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    category: labelSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    zoneId: identifierSchema.optional(),
    tone: toneSchema.optional(),
    details: z.array(shortTextSchema).max(20).optional(),
  })
  .strict();
const cartesianZoneSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    memberIds: z.array(identifierSchema).max(500),
  })
  .strict();
const cartesianSpatialBlockSchema = z
  .object({
    type: z.literal("spatial"),
    layout: z.literal("cartesian"),
    id: identifierSchema,
    label: labelSchema,
    description: textSchema,
    points: z.array(cartesianPointSchema).max(500),
    zones: z.array(cartesianZoneSchema).max(100),
    relationships: z.array(spatialRelationshipSchema).max(2_000).optional(),
    legend: z.array(spatialLegendItemSchema).max(20),
  })
  .strict()
  .superRefine((block, context) => {
    const pointIds = new Set<string>();
    for (const [index, point] of block.points.entries()) {
      if (pointIds.has(point.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point id "${point.id}" is duplicated`,
          path: ["points", index, "id"],
        });
      }
      pointIds.add(point.id);
    }
    const zoneIds = new Set<string>();
    for (const [index, zone] of block.zones.entries()) {
      if (zoneIds.has(zone.id) || pointIds.has(zone.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial zone id "${zone.id}" is duplicated`,
          path: ["zones", index, "id"],
        });
      }
      zoneIds.add(zone.id);
      for (const memberId of zone.memberIds) {
        if (!pointIds.has(memberId)) {
          context.addIssue({
            code: "custom",
            message: `Spatial zone member "${memberId}" has no matching point`,
            path: ["zones", index, "memberIds"],
          });
        }
      }
    }
    for (const [index, point] of block.points.entries()) {
      if (point.zoneId && !zoneIds.has(point.zoneId)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point zone "${point.zoneId}" has no matching zone`,
          path: ["points", index, "zoneId"],
        });
      }
    }
    const nodeIds = new Set([...pointIds, ...zoneIds]);
    for (const [index, relationship] of (block.relationships ?? []).entries()) {
      if (
        !nodeIds.has(relationship.sourceId) ||
        !nodeIds.has(relationship.targetId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Spatial relationship endpoints must reference declared points or zones",
          path: ["relationships", index],
        });
      }
    }
  });

const radialPointSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    kind: labelSchema,
    status: labelSchema,
    tags: z.array(labelSchema).max(30).optional(),
    distance: coordinateSchema,
    bearing: z.number().finite().min(0).lt(360),
    relatedIds: z.array(identifierSchema).max(100).optional(),
    tone: toneSchema.optional(),
    details: z.array(shortTextSchema).max(20).optional(),
  })
  .strict();
const spatialClusterSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    memberIds: z.array(identifierSchema).min(2).max(500),
  })
  .strict();
const radialStratumSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    maxDistance: coordinateSchema,
  })
  .strict();
const radialSpatialBlockSchema = z
  .object({
    type: z.literal("spatial"),
    layout: z.literal("radial"),
    id: identifierSchema,
    label: labelSchema,
    description: textSchema,
    centerLabel: labelSchema,
    centerKind: z.enum(["identity", "centroid"]),
    points: z.array(radialPointSchema).max(500),
    clusters: z.array(spatialClusterSchema).max(100).optional(),
    relationships: z.array(spatialRelationshipSchema).max(2_000).optional(),
    strata: z.array(radialStratumSchema).min(1).max(10),
    legend: z.array(spatialLegendItemSchema).max(20),
  })
  .strict()
  .superRefine((block, context) => {
    const pointIds = new Set<string>();
    for (const [index, point] of block.points.entries()) {
      if (pointIds.has(point.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial point id "${point.id}" is duplicated`,
          path: ["points", index, "id"],
        });
      }
      pointIds.add(point.id);
    }
    for (const [index, point] of block.points.entries()) {
      for (const relatedId of point.relatedIds ?? []) {
        if (!pointIds.has(relatedId)) {
          context.addIssue({
            code: "custom",
            message: `Related point "${relatedId}" is not declared`,
            path: ["points", index, "relatedIds"],
          });
        }
      }
    }
    const clusterIds = new Set<string>();
    for (const [index, cluster] of (block.clusters ?? []).entries()) {
      if (clusterIds.has(cluster.id)) {
        context.addIssue({
          code: "custom",
          message: `Spatial cluster id "${cluster.id}" is duplicated`,
          path: ["clusters", index, "id"],
        });
      }
      clusterIds.add(cluster.id);
      for (const memberId of cluster.memberIds) {
        if (!pointIds.has(memberId)) {
          context.addIssue({
            code: "custom",
            message: `Spatial cluster member "${memberId}" has no matching point`,
            path: ["clusters", index, "memberIds"],
          });
        }
      }
    }
    for (const [index, relationship] of (block.relationships ?? []).entries()) {
      if (
        !pointIds.has(relationship.sourceId) ||
        !pointIds.has(relationship.targetId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Spatial relationship endpoints must reference declared points",
          path: ["relationships", index],
        });
      }
    }
    let previous = -1;
    for (const [index, stratum] of block.strata.entries()) {
      if (stratum.maxDistance <= previous) {
        context.addIssue({
          code: "custom",
          message: "Radial strata must increase by maximum distance",
          path: ["strata", index, "maxDistance"],
        });
      }
      previous = stratum.maxDistance;
    }
  });
const spatialBlockSchema = z.discriminatedUnion("layout", [
  cartesianSpatialBlockSchema,
  radialSpatialBlockSchema,
]);

const dashboardPanelBlockSchema = z.union([
  statsBlockSchema,
  keyValuesBlockSchema,
  noticeBlockSchema,
  groupBlockSchema,
  flowBlockSchema,
  meterBlockSchema,
  progressBlockSchema,
  linksBlockSchema,
  listBlockSchema,
  tableBlockSchema,
  matrixBlockSchema,
  spatialBlockSchema,
]);
const dashboardTabsBlockSchema = z
  .object({
    type: z.literal("tabs"),
    id: identifierSchema,
    label: labelSchema,
    defaultTab: identifierSchema,
    tabs: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: labelSchema,
            count: z.number().int().nonnegative().optional(),
            blocks: z.array(dashboardPanelBlockSchema).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, tab] of block.tabs.entries()) {
      if (ids.has(tab.id)) {
        context.addIssue({
          code: "custom",
          message: `Tab id "${tab.id}" is duplicated`,
          path: ["tabs", index, "id"],
        });
      }
      ids.add(tab.id);
    }
    if (!ids.has(block.defaultTab)) {
      context.addIssue({
        code: "custom",
        message: `Default tab "${block.defaultTab}" has no matching tab`,
        path: ["defaultTab"],
      });
    }
  });

function isWorkspaceActionDefinition(
  value: unknown,
): value is AnyWorkspaceActionDefinition {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "rizom-workspace-action" &&
    "name" in value &&
    typeof value.name === "string" &&
    "input" in value &&
    typeof value.input === "object" &&
    value.input !== null &&
    "safeParse" in value.input &&
    typeof value.input.safeParse === "function"
  );
}

const workspaceActionDefinitionSchema = z.custom<AnyWorkspaceActionDefinition>(
  isWorkspaceActionDefinition,
  { message: "Expected a workspace action definition" },
);

interface SourceActionControl {
  readonly action: AnyWorkspaceActionDefinition;
  readonly input: unknown;
  readonly capability?:
    | {
        readonly id: string;
        readonly label: string;
        readonly description?: string | undefined;
        readonly confirmation?: "prepared" | undefined;
      }
    | undefined;
  readonly disabled?: boolean | undefined;
}

const capabilityDefinitionSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    description: textSchema.optional(),
    confirmation: z.literal("prepared").optional(),
  })
  .strict();
const sourceActionControlSchema = z
  .object({
    action: workspaceActionDefinitionSchema,
    input: z.unknown(),
    capability: capabilityDefinitionSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

const cmsListItemSchema = listItemSchema.extend({
  actions: z.array(sourceActionControlSchema).max(20).optional(),
});
const cmsListBlockSchema = z
  .object({
    type: z.literal("list"),
    id: identifierSchema,
    empty: shortTextSchema,
    filter: listFilterSchema.optional(),
    items: z.array(cmsListItemSchema).max(200),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, item] of block.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `List item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
    if (block.filter) {
      const optionValues = new Set(
        block.filter.options.map((option) => option.value),
      );
      const allValue = block.filter.allValue ?? "all";
      for (const [index, item] of block.items.entries()) {
        for (const value of item.filterValues ?? []) {
          if (value !== allValue && !optionValues.has(value)) {
            context.addIssue({
              code: "custom",
              message: `List item filter value "${value}" has no matching option`,
              path: ["items", index, "filterValues"],
            });
          }
        }
      }
    }
  });

const cmsTableRowSchema = tableRowSchema.extend({
  actions: z.array(sourceActionControlSchema).max(20).optional(),
});
const cmsTableBlockSchema = z
  .object({
    type: z.literal("table"),
    id: identifierSchema,
    empty: shortTextSchema,
    filters: z.array(tableFilterSchema).max(20).optional(),
    columns: z.array(tableColumnSchema).min(1).max(30),
    rows: z.array(cmsTableRowSchema).max(500),
  })
  .strict()
  .superRefine((block, context) => {
    const columnKeys = new Set<string>();
    for (const [index, column] of block.columns.entries()) {
      if (columnKeys.has(column.key)) {
        context.addIssue({
          code: "custom",
          message: `Table column key "${column.key}" is duplicated`,
          path: ["columns", index, "key"],
        });
      }
      columnKeys.add(column.key);
    }
    for (const [index, filter] of (block.filters ?? []).entries()) {
      if (!columnKeys.has(filter.key)) {
        context.addIssue({
          code: "custom",
          message: `Table filter key "${filter.key}" has no matching column`,
          path: ["filters", index, "key"],
        });
      }
    }
    const rowIds = new Set<string>();
    for (const [rowIndex, row] of block.rows.entries()) {
      if (rowIds.has(row.id)) {
        context.addIssue({
          code: "custom",
          message: `Table row id "${row.id}" is duplicated`,
          path: ["rows", rowIndex, "id"],
        });
      }
      rowIds.add(row.id);
      for (const key of Object.keys(row.cells)) {
        if (!columnKeys.has(key)) {
          context.addIssue({
            code: "custom",
            message: `Table cell key "${key}" has no matching column`,
            path: ["rows", rowIndex, "cells", key],
          });
        }
      }
    }
  });

const cmsMatrixCellSchema = z
  .object({
    id: identifierSchema,
    label: labelSchema,
    tone: toneSchema.optional(),
    empty: shortTextSchema,
    items: z.array(cmsListItemSchema).max(100),
  })
  .strict()
  .superRefine((cell, context) => {
    const ids = new Set<string>();
    for (const [index, item] of cell.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix item id "${item.id}" is duplicated`,
          path: ["items", index, "id"],
        });
      }
      ids.add(item.id);
    }
  });
const cmsMatrixBlockSchema = z
  .object({
    type: z.literal("matrix"),
    id: identifierSchema,
    columns: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional(),
    cells: z.array(cmsMatrixCellSchema).min(1).max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, cell] of block.cells.entries()) {
      if (ids.has(cell.id)) {
        context.addIssue({
          code: "custom",
          message: `Matrix cell id "${cell.id}" is duplicated`,
          path: ["cells", index, "id"],
        });
      }
      ids.add(cell.id);
    }
  });

const cmsActionBlockSchema = sourceActionControlSchema.extend({
  type: z.literal("action"),
  id: identifierSchema.optional(),
});
const cmsActionsBlockSchema = z
  .object({
    type: z.literal("actions"),
    id: identifierSchema.optional(),
    items: z.array(sourceActionControlSchema).max(30),
  })
  .strict();
const cmsPanelBlockSchema = z.union([
  statsBlockSchema,
  keyValuesBlockSchema,
  noticeBlockSchema,
  textBlockSchema,
  groupBlockSchema,
  flowBlockSchema,
  meterBlockSchema,
  progressBlockSchema,
  queryBlockSchema,
  linksBlockSchema,
  cmsListBlockSchema,
  cmsTableBlockSchema,
  cmsMatrixBlockSchema,
  spatialBlockSchema,
  cmsActionBlockSchema,
  cmsActionsBlockSchema,
]);
const cmsTabsBlockSchema = z
  .object({
    type: z.literal("tabs"),
    id: identifierSchema,
    label: labelSchema,
    defaultTab: identifierSchema,
    tabs: z
      .array(
        z
          .object({
            id: identifierSchema,
            label: labelSchema,
            count: z.number().int().nonnegative().optional(),
            blocks: z.array(cmsPanelBlockSchema).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((block, context) => {
    const ids = new Set<string>();
    for (const [index, tab] of block.tabs.entries()) {
      if (ids.has(tab.id)) {
        context.addIssue({
          code: "custom",
          message: `Tab id "${tab.id}" is duplicated`,
          path: ["tabs", index, "id"],
        });
      }
      ids.add(tab.id);
    }
    if (!ids.has(block.defaultTab)) {
      context.addIssue({
        code: "custom",
        message: `Default tab "${block.defaultTab}" has no matching tab`,
        path: ["defaultTab"],
      });
    }
  });

/**
 * Master/detail is a container in the same closed union as tabs: one collection
 * plus the panels of whichever row is open. Nesting stays one level deep, and
 * the open row is identified rather than flagged per item, so selection cannot
 * disagree with the content it describes.
 */
/* A card groups panels under one caption so a group of related facts reads
   as one thing rather than as loose blocks. */
const cmsCardBlockSchema = z
  .object({
    type: z.literal("card"),
    id: identifierSchema,
    label: labelSchema,
    tone: toneSchema.optional(),
    blocks: z.array(cmsPanelBlockSchema).max(12),
  })
  .strict();

const cmsDetailBlockSchema = z
  .object({
    type: z.literal("detail"),
    id: identifierSchema,
    /** Canonical query field the host writes with the open row's id. */
    queryKey: identifierSchema,
    empty: shortTextSchema,
    master: z.union([cmsListBlockSchema, cmsTableBlockSchema]),
    open: z
      .object({
        forId: rowIdentifierSchema,
        title: labelSchema,
        blocks: z
          .array(z.union([cmsPanelBlockSchema, cmsCardBlockSchema]))
          .max(30),
      })
      .strict()
      .optional(),
  })
  .strict();

/* A card groups panels under one caption so an aside reads as a stack of
   related facts rather than loose blocks. */
/* `forId` marks the open row where the master contains it. It is deliberately
   not required to match: a paged or filtered collection can hold a selection
   whose row is not in the current window, and losing the reading pane because
   the operator turned a page would be worse than an unmarked list. */

/* The composition every operator surface wants: a column of work beside a rail
   of standing facts. Regions hold panels and cards, one level deep. */
const cmsColumnsBlockSchema = z
  .object({
    type: z.literal("columns"),
    id: identifierSchema,
    primary: z
      .array(z.union([cmsPanelBlockSchema, cmsCardBlockSchema]))
      .max(20),
    aside: z.array(z.union([cmsPanelBlockSchema, cmsCardBlockSchema])).max(12),
  })
  .strict();

const cmsViewSourceSchema = z
  .object({
    kicker: labelSchema.optional(),
    title: shortTextSchema.optional(),
    description: textSchema.optional(),
    status: z
      .object({
        label: labelSchema,
        detail: shortTextSchema.optional(),
        tone: toneSchema.optional(),
      })
      .strict()
      .optional(),
    blocks: z
      .array(
        z.union([
          cmsPanelBlockSchema,
          cmsTabsBlockSchema,
          cmsDetailBlockSchema,
          cmsColumnsBlockSchema,
        ]),
      )
      .max(50),
  })
  .strict()
  .superRefine((view, context) => {
    const ids = new Set<string>();
    for (const [index, block] of view.blocks.entries()) {
      if (block.id === undefined) continue;
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          message: `Operator view block id "${block.id}" is duplicated`,
          path: ["blocks", index, "id"],
        });
      }
      ids.add(block.id);
    }
  });

type CmsViewSource = z.output<typeof cmsViewSourceSchema>;
type CmsBlockSource = CmsViewSource["blocks"][number];
type CmsRegionSource = z.output<
  typeof cmsColumnsBlockSchema
>["primary"][number];

/** Panels may nest in containers; containers may not nest in each other. */
function isPanelBlock(
  block: RuntimeCmsOperatorBlock,
): block is RuntimeCmsOperatorPanelBlock {
  return (
    block.type !== "tabs" &&
    block.type !== "detail" &&
    block.type !== "columns" &&
    block.type !== "card"
  );
}

const jsonValueSchema: z.ZodType<JsonValue, unknown> = z.json();

function normalizeActionControls(
  controls: readonly SourceActionControl[],
  declared: readonly AnyWorkspaceActionDefinition[],
  permission: UserPermissionLevel,
  path: readonly PropertyKey[],
): {
  readonly controls: readonly RuntimeOperatorActionControl[];
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  const normalized: RuntimeOperatorActionControl[] = [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  for (const [index, control] of controls.entries()) {
    const actionPath = [...path, index];
    if (!declared.includes(control.action)) {
      issues.push({
        path: [...actionPath, "action"],
        message: `Action "${control.action.name}" is not declared by this workspace`,
      });
      continue;
    }
    if (
      control.action.permission !== undefined &&
      !meetsPermission(permission, control.action.permission)
    ) {
      continue;
    }
    if (control.action.catalog === true && !control.capability) {
      issues.push({
        path: [...actionPath, "capability"],
        message: `Catalog action "${control.action.name}" requires a typed capability definition`,
      });
      continue;
    }
    if (control.action.catalog !== true && control.capability) {
      issues.push({
        path: [...actionPath, "capability"],
        message: `Action "${control.action.name}" is not a capability catalog`,
      });
      continue;
    }
    if (
      control.capability?.confirmation === "prepared" &&
      control.action.confirmation?.kind !== "prepared"
    ) {
      issues.push({
        path: [...actionPath, "capability", "confirmation"],
        message: `Capability "${control.capability.id}" requires a prepared catalog action`,
      });
      continue;
    }
    const parsedInput = control.action.input.safeParse(control.input);
    if (!parsedInput.success) {
      issues.push(
        ...parsedInput.error.issues.map((issue) => ({
          path: [...actionPath, "input", ...issue.path],
          message: issue.message,
        })),
      );
      continue;
    }
    const jsonInput = jsonValueSchema.safeParse(parsedInput.data);
    if (!jsonInput.success) {
      issues.push({
        path: [...actionPath, "input"],
        message: "Workspace action input must be JSON-native",
      });
      continue;
    }
    const actionConfirmation = control.action.confirmation;
    const confirmation: RuntimeOperatorActionControl["confirmation"] =
      actionConfirmation?.kind === "static"
        ? actionConfirmation
        : actionConfirmation?.kind === "prepared" &&
            (actionConfirmation.conditional !== true ||
              control.capability?.confirmation === "prepared")
          ? { kind: "prepared" }
          : undefined;
    normalized.push(
      Object.freeze({
        actionId: control.action.name,
        ...(control.capability ? { capabilityId: control.capability.id } : {}),
        label: control.capability?.label ?? control.action.label,
        input: jsonInput.data,
        ...(control.disabled ? { disabled: true } : {}),
        ...(confirmation ? { confirmation } : {}),
      }),
    );
  }
  return { controls: normalized, issues };
}

function actionBlock(
  action: RuntimeOperatorActionControl,
  id: string | undefined,
): RuntimeCmsOperatorActionBlock {
  return {
    type: "action",
    ...(id ? { id } : {}),
    ...action,
  };
}

function normalizeCmsBlock(
  block: CmsBlockSource | CmsRegionSource,
  blockIndex: number,
  declared: readonly AnyWorkspaceActionDefinition[],
  permission: UserPermissionLevel,
): {
  readonly block?: RuntimeCmsOperatorBlock | undefined;
  readonly issues: readonly RuntimeOperatorValidationIssue[];
} {
  switch (block.type) {
    case "list": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const items = block.items.map((item, itemIndex) => {
        const actions = normalizeActionControls(
          item.actions ?? [],
          declared,
          permission,
          ["blocks", blockIndex, "items", itemIndex, "actions"],
        );
        issues.push(...actions.issues);
        return {
          id: item.id,
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          ...(item.meta ? { meta: item.meta } : {}),
          ...(item.metadata ? { metadata: item.metadata } : {}),
          ...(item.tags ? { tags: item.tags } : {}),
          ...(item.count !== undefined ? { count: item.count } : {}),
          ...(item.badges ? { badges: item.badges } : {}),
          ...(item.filterValues ? { filterValues: item.filterValues } : {}),
          ...(item.links ? { links: item.links } : {}),
          ...(item.tone ? { tone: item.tone } : {}),
          ...(item.link ? { link: item.link } : {}),
          ...(actions.controls.length > 0 ? { actions: actions.controls } : {}),
        };
      });
      return {
        block: {
          type: "list",
          id: block.id,
          empty: block.empty,
          ...(block.filter ? { filter: block.filter } : {}),
          items,
        },
        issues,
      };
    }
    case "table": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const rows = block.rows.map((row, rowIndex) => {
        const actions = normalizeActionControls(
          row.actions ?? [],
          declared,
          permission,
          ["blocks", blockIndex, "rows", rowIndex, "actions"],
        );
        issues.push(...actions.issues);
        return {
          id: row.id,
          cells: row.cells,
          ...(row.link ? { link: row.link } : {}),
          ...(actions.controls.length > 0 ? { actions: actions.controls } : {}),
        };
      });
      return {
        block: {
          type: "table",
          id: block.id,
          empty: block.empty,
          ...(block.filters ? { filters: block.filters } : {}),
          columns: block.columns,
          rows,
        },
        issues,
      };
    }
    case "matrix": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const cells = block.cells.map((cell, cellIndex) => ({
        id: cell.id,
        label: cell.label,
        ...(cell.tone ? { tone: cell.tone } : {}),
        empty: cell.empty,
        items: cell.items.map((item, itemIndex) => {
          const actions = normalizeActionControls(
            item.actions ?? [],
            declared,
            permission,
            [
              "blocks",
              blockIndex,
              "cells",
              cellIndex,
              "items",
              itemIndex,
              "actions",
            ],
          );
          issues.push(...actions.issues);
          return {
            id: item.id,
            title: item.title,
            ...(item.description ? { description: item.description } : {}),
            ...(item.meta ? { meta: item.meta } : {}),
            ...(item.metadata ? { metadata: item.metadata } : {}),
            ...(item.tags ? { tags: item.tags } : {}),
            ...(item.count !== undefined ? { count: item.count } : {}),
            ...(item.badges ? { badges: item.badges } : {}),
            ...(item.filterValues ? { filterValues: item.filterValues } : {}),
            ...(item.links ? { links: item.links } : {}),
            ...(item.tone ? { tone: item.tone } : {}),
            ...(item.link ? { link: item.link } : {}),
            ...(actions.controls.length > 0
              ? { actions: actions.controls }
              : {}),
          };
        }),
      }));
      return {
        block: {
          type: "matrix",
          id: block.id,
          ...(block.columns ? { columns: block.columns } : {}),
          cells,
        },
        issues,
      };
    }
    case "tabs": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const tabs = block.tabs.map((tab) => {
        const blocks: RuntimeCmsOperatorPanelBlock[] = [];
        for (const [panelIndex, panelBlock] of tab.blocks.entries()) {
          const normalized = normalizeCmsBlock(
            panelBlock,
            panelIndex,
            declared,
            permission,
          );
          issues.push(...normalized.issues);
          if (normalized.block && isPanelBlock(normalized.block)) {
            blocks.push(normalized.block);
          }
        }
        return {
          id: tab.id,
          label: tab.label,
          ...(tab.count !== undefined ? { count: tab.count } : {}),
          blocks,
        };
      });
      return {
        block: {
          type: "tabs",
          id: block.id,
          label: block.label,
          defaultTab: block.defaultTab,
          tabs,
        },
        issues,
      };
    }
    case "card": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const panels: RuntimeCmsOperatorPanelBlock[] = [];
      for (const [panelIndex, panel] of block.blocks.entries()) {
        const normalized = normalizeCmsBlock(
          panel,
          panelIndex,
          declared,
          permission,
        );
        issues.push(...normalized.issues);
        if (normalized.block && isPanelBlock(normalized.block)) {
          panels.push(normalized.block);
        }
      }
      return {
        block: {
          type: "card",
          id: block.id,
          label: block.label,
          ...(block.tone ? { tone: block.tone } : {}),
          blocks: panels,
        },
        issues,
      };
    }
    case "columns": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const region = (
        entries: readonly CmsRegionSource[],
      ): RuntimeCmsOperatorRegionBlock[] => {
        const out: RuntimeCmsOperatorRegionBlock[] = [];
        for (const [index, entry] of entries.entries()) {
          const normalized = normalizeCmsBlock(
            entry,
            index,
            declared,
            permission,
          );
          issues.push(...normalized.issues);
          const candidate = normalized.block;
          if (
            candidate &&
            (isPanelBlock(candidate) || candidate.type === "card")
          ) {
            out.push(candidate);
          }
        }
        return out;
      };
      return {
        block: {
          type: "columns",
          id: block.id,
          primary: region(block.primary),
          aside: region(block.aside),
        },
        issues,
      };
    }
    case "detail": {
      const issues: RuntimeOperatorValidationIssue[] = [];
      const master = normalizeCmsBlock(
        block.master,
        blockIndex,
        declared,
        permission,
      );
      issues.push(...master.issues);
      const masterBlock = master.block;
      if (
        !masterBlock ||
        (masterBlock.type !== "list" && masterBlock.type !== "table")
      ) {
        return { issues };
      }
      const openBlocks: RuntimeCmsOperatorRegionBlock[] = [];
      for (const [panelIndex, panelBlock] of (
        block.open?.blocks ?? []
      ).entries()) {
        const normalized = normalizeCmsBlock(
          panelBlock,
          panelIndex,
          declared,
          permission,
        );
        issues.push(...normalized.issues);
        const candidate = normalized.block;
        if (
          candidate &&
          (isPanelBlock(candidate) || candidate.type === "card")
        ) {
          openBlocks.push(candidate);
        }
      }
      return {
        block: {
          type: "detail",
          id: block.id,
          queryKey: block.queryKey,
          empty: block.empty,
          master: masterBlock,
          ...(block.open
            ? {
                open: {
                  forId: block.open.forId,
                  title: block.open.title,
                  blocks: openBlocks,
                },
              }
            : {}),
        },
        issues,
      };
    }
    case "action": {
      const result = normalizeActionControls([block], declared, permission, [
        "blocks",
        blockIndex,
      ]);
      const action = result.controls[0];
      return {
        ...(action
          ? {
              block: actionBlock(action, block.id),
            }
          : {}),
        issues: result.issues,
      };
    }
    case "actions": {
      const result = normalizeActionControls(
        block.items,
        declared,
        permission,
        ["blocks", blockIndex, "items"],
      );
      return {
        block: {
          type: "actions",
          ...(block.id ? { id: block.id } : {}),
          items: result.controls,
        },
        issues: result.issues,
      };
    }
    default:
      return { block, issues: [] };
  }
}

const viewSchema: z.ZodType<RuntimeDashboardOperatorView, unknown> = z
  .object({
    title: shortTextSchema.optional(),
    blocks: z
      .array(z.union([dashboardPanelBlockSchema, dashboardTabsBlockSchema]))
      .max(50),
  })
  .strict()
  .superRefine((view, context) => {
    const ids = new Set<string>();
    for (const [index, block] of view.blocks.entries()) {
      if (block.id === undefined) continue;
      if (ids.has(block.id)) {
        context.addIssue({
          code: "custom",
          message: `Operator view block id "${block.id}" is duplicated`,
          path: ["blocks", index, "id"],
        });
      }
      ids.add(block.id);
    }
  });

const digestSchema: z.ZodType<RuntimeDashboardDigest, unknown> = z
  .object({
    items: z
      .array(
        z
          .object({
            label: labelSchema,
            value: z.string().max(500),
            tone: z.enum(["good", "warn"]).optional(),
          })
          .strict(),
      )
      .max(4),
    attention: z.number().int().nonnegative().optional(),
  })
  .strict();

const widgetDataSchema: z.ZodType<RuntimeDashboardWidgetData, unknown> = z
  .object({ view: viewSchema, digest: digestSchema.optional() })
  .strict();

function validationIssues(
  error: z.ZodError,
): readonly RuntimeOperatorValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectAuthorLinkTarget(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "cms",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!isUnknownRecord(value)) return;
  // A detail target names no block, so it is only meaningful where the
  // enclosing detail is known: inside that detail's own master collection.
  if (value["detail"] !== undefined && !insideDetailMaster) {
    issues.push({
      path,
      message:
        "A detail link is available only on rows of a detail block's master collection",
    });
    return;
  }
  if (
    value["kind"] === "external" ||
    value["kind"] === "entity" ||
    value["kind"] === "launch" ||
    value["kind"] === "detail"
  ) {
    issues.push({
      path,
      message:
        "Author links must use a typed external, entity, catalog, or launch target rather than a normalized host target",
    });
    return;
  }
  const launch = value["launch"];
  if (
    profile === "dashboard" &&
    isUnknownRecord(launch) &&
    (launch["target"] === "inbox-open-entity" ||
      launch["target"] === "inbox-capture-note" ||
      launch["target"] === "inbox-discuss-in-chat")
  ) {
    issues.push({
      path: [...path, "launch", "target"],
      message: `Launch intent "${launch["target"]}" is available only in CMS workspaces`,
    });
  }
}

function inspectAuthorLinkItems(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "cms",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!isUnknownRecord(item)) continue;
    inspectAuthorLinkTarget(
      item["target"],
      [...path, index, "target"],
      profile,
      issues,
      insideDetailMaster,
    );
  }
}

function inspectAuthorListItems(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "cms",
  issues: RuntimeOperatorValidationIssue[],
  insideDetailMaster = false,
): void {
  if (!Array.isArray(value)) return;
  for (const [index, item] of value.entries()) {
    if (!isUnknownRecord(item)) continue;
    inspectAuthorLinkTarget(
      item["link"],
      [...path, index, "link"],
      profile,
      issues,
      insideDetailMaster,
    );
    inspectAuthorLinkItems(
      item["links"],
      [...path, index, "links"],
      profile,
      issues,
      insideDetailMaster,
    );
  }
}

function inspectAuthorBlocks(
  value: unknown,
  path: readonly PropertyKey[],
  profile: "dashboard" | "cms",
  issues: RuntimeOperatorValidationIssue[],
): void {
  if (!Array.isArray(value)) return;
  for (const [index, block] of value.entries()) {
    if (!isUnknownRecord(block)) continue;
    const blockPath = [...path, index];
    switch (block["type"]) {
      case "links":
        inspectAuthorLinkItems(
          block["items"],
          [...blockPath, "items"],
          profile,
          issues,
        );
        break;
      case "list":
        inspectAuthorListItems(
          block["items"],
          [...blockPath, "items"],
          profile,
          issues,
        );
        break;
      case "table": {
        const rows = block["rows"];
        if (Array.isArray(rows)) {
          for (const [rowIndex, row] of rows.entries()) {
            if (!isUnknownRecord(row)) continue;
            inspectAuthorLinkTarget(
              row["link"],
              [...blockPath, "rows", rowIndex, "link"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "matrix": {
        const cells = block["cells"];
        if (Array.isArray(cells)) {
          for (const [cellIndex, cell] of cells.entries()) {
            if (!isUnknownRecord(cell)) continue;
            inspectAuthorListItems(
              cell["items"],
              [...blockPath, "cells", cellIndex, "items"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "tabs": {
        const tabs = block["tabs"];
        if (Array.isArray(tabs)) {
          for (const [tabIndex, tab] of tabs.entries()) {
            if (!isUnknownRecord(tab)) continue;
            inspectAuthorBlocks(
              tab["blocks"],
              [...blockPath, "tabs", tabIndex, "blocks"],
              profile,
              issues,
            );
          }
        }
        break;
      }
      case "detail": {
        const master = block["master"];
        if (isUnknownRecord(master)) {
          const masterPath = [...blockPath, "master"];
          inspectAuthorListItems(
            master["items"],
            [...masterPath, "items"],
            profile,
            issues,
            true,
          );
          const rows = master["rows"];
          if (Array.isArray(rows)) {
            for (const [rowIndex, row] of rows.entries()) {
              if (!isUnknownRecord(row)) continue;
              inspectAuthorLinkTarget(
                row["link"],
                [...masterPath, "rows", rowIndex, "link"],
                profile,
                issues,
                true,
              );
            }
          }
        }
        const open = block["open"];
        if (isUnknownRecord(open)) {
          inspectAuthorBlocks(
            open["blocks"],
            [...blockPath, "open", "blocks"],
            profile,
            issues,
          );
        }
        break;
      }
    }
  }
}

function authorLinkIssues(
  input: unknown,
  profile: "dashboard" | "cms",
): readonly RuntimeOperatorValidationIssue[] {
  if (!isUnknownRecord(input)) return [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  inspectAuthorBlocks(input["blocks"], ["blocks"], profile, issues);
  return issues;
}

export function safeParseRuntimeDashboardOperatorView(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardOperatorView> {
  const sourceIssues = authorLinkIssues(input, "dashboard");
  if (sourceIssues.length > 0) {
    return { success: false, issues: sourceIssues };
  }
  const result = viewSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}

export function safeParseRuntimeCmsOperatorView(
  input: unknown,
  options: {
    readonly actions: readonly AnyWorkspaceActionDefinition[];
    readonly permission: UserPermissionLevel;
  },
): RuntimeOperatorParseResult<RuntimeCmsOperatorView> {
  const sourceIssues = authorLinkIssues(input, "cms");
  if (sourceIssues.length > 0) {
    return { success: false, issues: sourceIssues };
  }
  const parsed = cmsViewSourceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, issues: validationIssues(parsed.error) };
  }
  const blocks: RuntimeCmsOperatorBlock[] = [];
  const issues: RuntimeOperatorValidationIssue[] = [];
  for (const [index, source] of parsed.data.blocks.entries()) {
    const normalized = normalizeCmsBlock(
      source,
      index,
      options.actions,
      options.permission,
    );
    issues.push(...normalized.issues);
    if (normalized.block) blocks.push(normalized.block);
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: Object.freeze({
      ...(parsed.data.kicker ? { kicker: parsed.data.kicker } : {}),
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.description
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      blocks: Object.freeze(blocks),
    }),
  };
}

export function safeParseRuntimeDashboardDigest(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardDigest> {
  const result = digestSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}

export function safeParseRuntimeDashboardWidgetData(
  input: unknown,
): RuntimeOperatorParseResult<RuntimeDashboardWidgetData> {
  const result = widgetDataSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: validationIssues(result.error) };
}
