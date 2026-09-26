import { z } from "@brains/utils/zod";
import { assertIdentifier } from "../package-definition";
import { assertText } from "./contract-assertions";
import type { OperatorSchema } from "./operator-context-contract";
import type {
  OperatorFieldControl,
  OperatorFieldDefinitionBase,
} from "./operator-field-contract";
import type {
  AnyWorkspaceActionDefinition,
  WorkspaceActionInput,
} from "./workspace-action-definition-contract";

/**
 * The bounds every operator view is measured against.
 *
 * These are the contract, not an implementation detail of validating it. An
 * author reading `readonly title?: string` cannot see that the string is
 * trimmed and capped at 160 characters; they find out when the runtime
 * rejects a view, which for an outside plugin is after they have shipped.
 */

/** An identifier an author chooses: trimmed, 1–120 characters. */
export const operatorIdentifierSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(120);

/**
 * Row identity is opaque data, not an authored name: a collection row may be
 * keyed by a composite source identity, so it is bounded more loosely than the
 * identifiers an author chooses.
 */
export const operatorRowIdentifierSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(400);

/** A visible name: trimmed, 1–160 characters. */
export const operatorLabelSchema: z.ZodString = z
  .string()
  .trim()
  .min(1)
  .max(160);

/**
 * Body text, in three sizes. Unlike identifiers and labels these are content
 * rather than names, so they are neither trimmed nor required to be non-empty.
 */
export const operatorShortTextSchema: z.ZodString = z.string().max(500);
export const operatorTextSchema: z.ZodString = z.string().max(4_000);
export const operatorLongTextSchema: z.ZodString = z.string().max(100_000);

/** A position within a view, as a fraction of its extent. */
export const operatorCoordinateSchema: z.ZodNumber = z
  .number()
  .finite()
  .min(0)
  .max(1);

/**
 * Tone and scalar, and the leaf blocks built from them.
 *
 * Each type below is the output of the schema beside it rather than a second
 * declaration of the same shape. The annotation `--isolatedDeclarations`
 * requires names the Zod kinds, not the bounds, so a limit still lives in
 * exactly one place — and an author can import the schema to check against it
 * rather than learning the limit from a rejected view.
 */

export const operatorToneSchema: z.ZodEnum<{
  good: "good";
  warn: "warn";
  neutral: "neutral";
  error: "error";
}> = z.enum(["good", "warn", "neutral", "error"]);
export type OperatorTone = z.output<typeof operatorToneSchema>;

export const operatorScalarSchema: z.ZodUnion<
  readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]
> = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type OperatorScalar = z.output<typeof operatorScalarSchema>;

export const operatorStatItemSchema: z.ZodObject<
  {
    label: z.ZodString;
    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
    caption: z.ZodOptional<z.ZodString>;
    tone: z.ZodOptional<typeof operatorToneSchema>;
  },
  z.core.$strict
> = z
  .object({
    label: operatorLabelSchema,
    value: z.union([z.string().max(500), z.number().finite()]),
    /** What the number counts, under the value. */
    caption: operatorShortTextSchema.optional(),
    tone: operatorToneSchema.optional(),
  })
  .strict();
export type OperatorStatItem = z.output<typeof operatorStatItemSchema>;

export const operatorStatsBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"stats">;
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodReadonly<z.ZodArray<typeof operatorStatItemSchema>>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("stats"),
    id: operatorIdentifierSchema.optional(),
    items: z.array(operatorStatItemSchema).max(20).readonly(),
  })
  .strict();
export type OperatorStatsBlock = z.output<typeof operatorStatsBlockSchema>;

export const operatorKeyValueItemSchema: z.ZodObject<
  { label: z.ZodString; value: typeof operatorScalarSchema },
  z.core.$strict
> = z
  .object({ label: operatorLabelSchema, value: operatorScalarSchema })
  .strict();
export type OperatorKeyValueItem = z.output<typeof operatorKeyValueItemSchema>;

export const operatorKeyValuesBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"key-values">;
    id: z.ZodOptional<z.ZodString>;
    items: z.ZodReadonly<z.ZodArray<typeof operatorKeyValueItemSchema>>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("key-values"),
    id: operatorIdentifierSchema.optional(),
    items: z.array(operatorKeyValueItemSchema).max(40).readonly(),
  })
  .strict();
export type OperatorKeyValuesBlock = z.output<
  typeof operatorKeyValuesBlockSchema
>;

export const operatorNoticeBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"notice">;
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
    details: z.ZodOptional<z.ZodReadonly<z.ZodArray<z.ZodString>>>;
    tone: z.ZodOptional<typeof operatorToneSchema>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("notice"),
    id: operatorIdentifierSchema.optional(),
    title: operatorLabelSchema.optional(),
    text: operatorTextSchema,
    /** Complete supporting records, disclosed without repeating the heading. */
    details: z.array(operatorLongTextSchema).max(50).readonly().optional(),
    tone: operatorToneSchema.optional(),
  })
  .strict();
export type OperatorNoticeBlock = z.output<typeof operatorNoticeBlockSchema>;

export const operatorTextBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"text">;
    id: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
    truncated: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("text"),
    id: operatorIdentifierSchema.optional(),
    label: operatorLabelSchema.optional(),
    text: operatorLongTextSchema,
    truncated: z.boolean().optional(),
  })
  .strict();
export type OperatorTextBlock = z.output<typeof operatorTextBlockSchema>;

export interface OperatorGroupItem {
  readonly id: string;
  readonly label: string;
  readonly value?: OperatorScalar | undefined;
  readonly description?: string | undefined;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorGroupBlock {
  readonly type: "group";
  readonly id: string;
  readonly label: string;
  readonly items: readonly OperatorGroupItem[];
}

export interface OperatorFlowStep {
  readonly id: string;
  readonly label: string;
  readonly status: "idle" | "active" | "complete" | "failed";
  readonly detail?: string | undefined;
}

export interface OperatorFlowBlock {
  readonly type: "flow";
  readonly id: string;
  readonly label: string;
  readonly direction?: "forward" | "bidirectional" | undefined;
  readonly steps: readonly OperatorFlowStep[];
}

export const operatorMeterItemSchema: z.ZodObject<
  {
    id: z.ZodString;
    label: z.ZodString;
    value: z.ZodNumber;
    max: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodOptional<z.ZodString>;
    tone: z.ZodOptional<typeof operatorToneSchema>;
  },
  z.core.$strict
> = z
  .object({
    id: operatorIdentifierSchema,
    label: operatorLabelSchema,
    value: z.number().finite().nonnegative(),
    max: z.number().finite().positive().optional(),
    unit: operatorLabelSchema.optional(),
    tone: operatorToneSchema.optional(),
  })
  .strict()
  .superRefine((item, context) => {
    // The one rule here that relates two fields, so no type can carry it.
    if (item.max !== undefined && item.value > item.max) {
      context.addIssue({
        code: "custom",
        message: "Meter value cannot exceed its maximum",
        path: ["value"],
      });
    }
  });
export type OperatorMeterItem = z.output<typeof operatorMeterItemSchema>;

export const operatorMeterBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"meters">;
    id: z.ZodString;
    items: z.ZodReadonly<z.ZodArray<typeof operatorMeterItemSchema>>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("meters"),
    id: operatorIdentifierSchema,
    items: z.array(operatorMeterItemSchema).max(30).readonly(),
  })
  .strict();
export type OperatorMeterBlock = z.output<typeof operatorMeterBlockSchema>;

export const operatorProgressBlockSchema: z.ZodObject<
  {
    type: z.ZodLiteral<"progress">;
    id: z.ZodString;
    label: z.ZodString;
    state: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
    startedAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    progress: z.ZodOptional<z.ZodNumber>;
    tone: z.ZodOptional<typeof operatorToneSchema>;
  },
  z.core.$strict
> = z
  .object({
    type: z.literal("progress"),
    id: operatorIdentifierSchema,
    label: operatorLabelSchema,
    state: operatorLabelSchema,
    detail: operatorTextSchema.optional(),
    startedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    progress: operatorCoordinateSchema.optional(),
    tone: operatorToneSchema.optional(),
  })
  .strict();
export type OperatorProgressBlock = z.output<
  typeof operatorProgressBlockSchema
>;

export interface OperatorQueryOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | undefined;
}

export interface OperatorQuerySelectControl {
  readonly key: string;
  readonly label: string;
  readonly value?: string | undefined;
  readonly allLabel?: string | undefined;
  readonly options: readonly OperatorQueryOption[];
}

export interface OperatorQueryDefinition {
  readonly controls: readonly OperatorQuerySelectControl[];
  readonly pagination?:
    | {
        readonly offset: number;
        readonly limit: number;
        readonly total: number;
        readonly label?: string | undefined;
      }
    | undefined;
}

export interface OperatorQueryBlock extends OperatorQueryDefinition {
  readonly type: "query";
  readonly id: string;
}

export interface OperatorEntityCatalogDefinition {
  readonly kind: "rizom-entity-catalog";
  readonly id: string;
  readonly label: string;
}

export function defineEntityCatalog(definition: {
  readonly id: string;
  readonly label: string;
}): OperatorEntityCatalogDefinition {
  assertIdentifier(definition.id, "Entity catalog id");
  assertText(definition.label, `Entity catalog "${definition.id}" label`);
  return Object.freeze({ kind: "rizom-entity-catalog", ...definition });
}

export interface OperatorExternalLinkTarget {
  readonly external: string;
}

/**
 * What a link needs from an entity: the brand proving it came from a real
 * `defineEntity`, and the type name. It is exactly what the runtime checks
 * before reducing the target to `{ entityType, id }`, so the compile-time
 * type and the runtime guard now state the same requirement.
 *
 * Naming the whole definition here would overstate the dependency and point
 * the operator contracts back at the entity contract — the edge that closes
 * into a cycle once an entity package can declare a dashboard widget.
 */
export interface OperatorLinkableEntity {
  readonly kind: "rizom-entity";
  readonly type: string;
}

export interface OperatorEntityLinkTarget {
  readonly entity: OperatorLinkableEntity;
  readonly id: string;
}

export type OperatorLaunchIntent =
  | { readonly target: "account-settings" }
  | { readonly target: "invitations" }
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

export interface OperatorCatalogEntityLinkTarget {
  readonly catalog: OperatorEntityCatalogDefinition;
  readonly entityType: string;
  readonly id: string;
}

export interface OperatorLaunchLinkTarget {
  readonly launch: OperatorLaunchIntent;
}

/**
 * Opens a row of the enclosing detail block's master. Legal only on rows of
 * that master, so it names no block and cannot dangle across the view.
 */
export interface OperatorDetailLinkTarget {
  readonly detail: { readonly itemId: string };
}

export type OperatorLinkTarget =
  | OperatorExternalLinkTarget
  | OperatorEntityLinkTarget
  | OperatorCatalogEntityLinkTarget
  | OperatorLaunchLinkTarget
  | OperatorDetailLinkTarget;

export interface OperatorLinkItem {
  readonly label: string;
  readonly target: OperatorLinkTarget;
}

export interface OperatorLinksBlock {
  readonly type: "links";
  readonly id?: string | undefined;
  readonly items: readonly OperatorLinkItem[];
}

export interface OperatorCapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly confirmation?: "prepared" | undefined;
}

export type WorkspaceActionFormControl = OperatorFieldControl;

export interface WorkspaceActionFormOption {
  readonly value: string;
  readonly label: string;
}

export interface WorkspaceActionFormFieldDefinition extends OperatorFieldDefinitionBase<WorkspaceActionFormControl> {
  readonly options?: readonly WorkspaceActionFormOption[] | undefined;
  /** Replace this field's label from the selected value of another form field. */
  readonly labelBy?:
    | {
        readonly field: string;
        readonly values: readonly WorkspaceActionFormOption[];
      }
    | undefined;
}

export type WorkspaceActionFormFieldMap<TSchema extends OperatorSchema> =
  TSchema extends z.ZodObject<z.ZodRawShape>
    ? Partial<{
        readonly [
          K in Extract<keyof z.input<TSchema>, string>
        ]: WorkspaceActionFormFieldDefinition;
      }>
    : never;

export interface WorkspaceActionFormDefinition<
  TSchema extends OperatorSchema = OperatorSchema,
> {
  readonly presentation?: "inline" | "disclosure" | undefined;
  readonly submitLabel?: string | undefined;
  readonly fields: WorkspaceActionFormFieldMap<TSchema>;
}

export interface WorkspaceActionResultFieldDefinition {
  readonly label: string;
  readonly copyable?: boolean | undefined;
  readonly sensitive?: boolean | undefined;
}

export type WorkspaceActionResultFieldMap<TSchema extends OperatorSchema> =
  TSchema extends z.ZodObject<z.ZodRawShape>
    ? {
        readonly [
          K in Extract<keyof z.output<TSchema>, string>
        ]: WorkspaceActionResultFieldDefinition;
      }
    : never;

export interface WorkspaceActionResultDefinition<
  TSchema extends OperatorSchema = OperatorSchema,
> {
  readonly title: string;
  readonly fields: WorkspaceActionResultFieldMap<TSchema>;
}

interface OperatorActionControlBase<
  TDefinition extends AnyWorkspaceActionDefinition,
> {
  readonly action: TDefinition;
  /** Provider-owned display copy; does not alter the action's identity or input. */
  readonly label?: string | undefined;
  readonly capability?: OperatorCapabilityDefinition | undefined;
  readonly disabled?: boolean | undefined;
  readonly result?:
    WorkspaceActionResultDefinition<TDefinition["output"]> | undefined;
}

/**
 * Where deriving from the schemas stops, and why.
 *
 * Everything above this point — the bounds and the leaf blocks — is the
 * output of the schema that validates it. Everything below is generic over a
 * plugin's own action definitions and stays hand-written.
 *
 * `OperatorActionControl` is the reason. It is a distributive conditional
 * type that reads `WorkspaceActionInput<TDefinition>`, so an action block's
 * `input` is checked against the schema of the very action it names, and it
 * makes `input` and `form` mutually exclusive in the same step. A Zod schema
 * validates one concrete shape and cannot be generic over types a plugin
 * brings with it, so deriving these would replace that check with an opaque
 * record — strictly worse than what is here.
 *
 * `test/operator-view-action-typing.test.ts` holds that reason to account:
 * its compiler errors stop appearing if this generic is ever flattened.
 *
 * Authors are not left to find bounds by being rejected in production.
 * `safeParseRuntimeStudioOperatorView` and `safeParseRuntimeDashboardWidgetData`
 * are exported for exactly this, and plugins already call them from their own
 * tests.
 */

export type OperatorActionControl<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
> = TDefinition extends AnyWorkspaceActionDefinition
  ? | (OperatorActionControlBase<TDefinition> & {
        readonly input: WorkspaceActionInput<TDefinition>;
        readonly form?: never;
      })
    | (OperatorActionControlBase<TDefinition> & {
        readonly input?: Partial<WorkspaceActionInput<TDefinition>>;
        readonly form: WorkspaceActionFormDefinition<TDefinition["input"]>;
      })
  : never;

export type OperatorActionBlock<TAction extends AnyWorkspaceActionDefinition> =
  OperatorActionControl<TAction> & {
    readonly type: "action";
    readonly id?: string | undefined;
  };

export interface OperatorActionsBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "actions";
  readonly id?: string | undefined;
  readonly items: readonly OperatorActionControl<TAction>[];
}

export interface OperatorBadge {
  readonly label: string;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorListItem<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  /** @deprecated Use metadata for multiple semantic values. */
  readonly meta?: string | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly count?: number | undefined;
  readonly badges?: readonly OperatorBadge[] | undefined;
  readonly filterValues?: readonly string[] | undefined;
  readonly links?: readonly OperatorLinkItem[] | undefined;
  readonly tone?: OperatorTone | undefined;
  readonly link?: OperatorLinkTarget | undefined;
  readonly actions?: readonly OperatorActionControl<TAction>[] | undefined;
  /** Trigger copy for a grouped row-action menu. */
  readonly actionsLabel?: string | undefined;
}

export interface OperatorListFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly emphasis?: "gap" | undefined;
}

export interface OperatorListFilter {
  readonly label: string;
  readonly defaultValue: string;
  readonly allValue?: string | undefined;
  readonly options: readonly OperatorListFilterOption[];
}

export interface OperatorListBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "list";
  readonly id: string;
  readonly empty: string;
  /** Reading hierarchy, independent of the workspace or transport rendering it. */
  readonly presentation?:
    "standard" | "editorial" | "attention" | "activity" | undefined;
  readonly filter?: OperatorListFilter | undefined;
  readonly items: readonly OperatorListItem<TAction>[];
}

export interface OperatorTableColumn {
  readonly key: string;
  readonly label: string;
  readonly align?: "start" | "center" | "end" | undefined;
}

export interface OperatorTableFilter {
  readonly key: string;
  readonly label: string;
  readonly values: readonly OperatorScalar[];
}

export interface OperatorTableCompactRow {
  readonly title: string;
  readonly description?: string | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly badges?: readonly OperatorBadge[] | undefined;
  readonly count?: number | undefined;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorTableRow<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly cells: Readonly<Record<string, OperatorScalar | readonly string[]>>;
  readonly link?: OperatorLinkTarget | undefined;
  readonly actions?: readonly OperatorActionControl<TAction>[] | undefined;
}

export interface OperatorTableBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "table";
  readonly id: string;
  readonly empty: string;
  readonly filters?: readonly OperatorTableFilter[] | undefined;
  readonly columns: readonly OperatorTableColumn[];
  readonly rows: readonly OperatorTableRow<TAction>[];
}

export interface StudioOperatorTableRow<
  TAction extends AnyWorkspaceActionDefinition,
> extends OperatorTableRow<TAction> {
  /** Source-declared list semantics used when Studio reflows a narrow table. */
  readonly compact?: OperatorTableCompactRow | undefined;
}

export interface StudioOperatorTableBlock<
  TAction extends AnyWorkspaceActionDefinition,
> extends Omit<OperatorTableBlock<TAction>, "rows"> {
  /** Server-backed controls and pagination owned by this collection. */
  readonly query?: OperatorQueryDefinition | undefined;
  readonly rows: readonly StudioOperatorTableRow<TAction>[];
}

export interface OperatorMatrixCell<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly label: string;
  readonly tone?: OperatorTone | undefined;
  readonly empty: string;
  readonly items: readonly OperatorListItem<TAction>[];
}

export interface OperatorMatrixBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "matrix";
  readonly id: string;
  readonly columns?: 1 | 2 | 3 | 4 | undefined;
  readonly cells: readonly OperatorMatrixCell<TAction>[];
}

export interface OperatorSpatialLegendItem {
  readonly label: string;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorSpatialRelationship {
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string | undefined;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorCartesianPoint {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly x: number;
  readonly y: number;
  readonly zoneId?: string | undefined;
  readonly tone?: OperatorTone | undefined;
  readonly details?: readonly string[] | undefined;
}

export interface OperatorCartesianZone {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly memberIds: readonly string[];
}

export interface OperatorCartesianSpatialBlock {
  readonly type: "spatial";
  readonly layout: "cartesian";
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly points: readonly OperatorCartesianPoint[];
  readonly zones: readonly OperatorCartesianZone[];
  readonly relationships?: readonly OperatorSpatialRelationship[] | undefined;
  readonly legend: readonly OperatorSpatialLegendItem[];
}

export interface OperatorRadialPoint {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly status: string;
  readonly tags?: readonly string[] | undefined;
  readonly distance: number;
  readonly bearing: number;
  readonly relatedIds?: readonly string[] | undefined;
  readonly tone?: OperatorTone | undefined;
  readonly details?: readonly string[] | undefined;
}

export interface OperatorSpatialCluster {
  readonly id: string;
  readonly label: string;
  readonly memberIds: readonly string[];
}

export interface OperatorRadialStratum {
  readonly id: string;
  readonly label: string;
  readonly maxDistance: number;
}

export interface OperatorRadialSpatialBlock {
  readonly type: "spatial";
  readonly layout: "radial";
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly centerLabel: string;
  readonly centerKind: "identity" | "centroid";
  readonly points: readonly OperatorRadialPoint[];
  readonly clusters?: readonly OperatorSpatialCluster[] | undefined;
  readonly relationships?: readonly OperatorSpatialRelationship[] | undefined;
  readonly strata: readonly OperatorRadialStratum[];
  readonly legend: readonly OperatorSpatialLegendItem[];
}

export type OperatorSpatialBlock =
  OperatorCartesianSpatialBlock | OperatorRadialSpatialBlock;

export type OperatorPanelBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> =
  | OperatorStatsBlock
  | OperatorKeyValuesBlock
  | OperatorNoticeBlock
  | OperatorTextBlock
  | OperatorGroupBlock
  | OperatorFlowBlock
  | OperatorMeterBlock
  | OperatorProgressBlock
  | OperatorQueryBlock
  | OperatorLinksBlock
  | OperatorActionBlock<TAction>
  | OperatorActionsBlock<TAction>
  | OperatorListBlock<TAction>
  | StudioOperatorTableBlock<TAction>
  | OperatorMatrixBlock<TAction>
  | OperatorSpatialBlock;

export interface OperatorTabPanel<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly label: string;
  readonly count?: number | undefined;
  /** Full workspace sections may live in a tab; nested tabs stay disallowed. */
  readonly blocks: readonly (
    | OperatorPanelBlock<TAction>
    | OperatorCardBlock<TAction>
    | OperatorDetailBlock<TAction>
    | OperatorColumnsBlock<TAction>
  )[];
}

export interface OperatorTabsBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  /** When set, the host reads and writes the selected tab through query state. */
  readonly queryKey?: string | undefined;
  readonly tabs: readonly OperatorTabPanel<TAction>[];
}

/**
 * One collection plus the panels of whichever row is open. The open row is
 * identified by `forId` rather than flagged per item, so the host derives
 * selection from the content it is actually showing.
 */
export interface OperatorDetailBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "detail";
  readonly id: string;
  /** Canonical query field the host writes with the open row's id. */
  readonly queryKey: string;
  /** Rendered in the detail region while nothing is open. */
  readonly empty: string;
  readonly master:
    OperatorListBlock<TAction> | StudioOperatorTableBlock<TAction>;
  readonly open?:
    | {
        readonly forId: string;
        readonly title: string;
        readonly blocks: readonly OperatorRegionBlock<TAction>[];
      }
    | undefined;
}

export interface OperatorCardBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "card";
  readonly id: string;
  readonly label: string;
  readonly metadata?: readonly string[] | undefined;
  /** Supporting information may start closed without removing its content. */
  readonly presentation?: "section" | "disclosure" | "feature" | undefined;
  /** Separate disclosure trigger; keeps the card heading visible when closed. */
  readonly disclosureLabel?: string | undefined;
  readonly tone?: OperatorTone | undefined;
  readonly blocks: readonly OperatorPanelBlock<TAction>[];
}

export type OperatorRegionBlock<TAction extends AnyWorkspaceActionDefinition> =
  OperatorPanelBlock<TAction> | OperatorCardBlock<TAction>;

/**
 * A column of work beside a rail of standing facts — the composition every
 * operator surface wants. Regions hold panels and cards, one level deep.
 */
export interface OperatorColumnsBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "columns";
  readonly id: string;
  readonly primary: readonly OperatorRegionBlock<TAction>[];
  readonly aside: readonly OperatorRegionBlock<TAction>[];
}

export type OperatorViewBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> =
  | OperatorPanelBlock<TAction>
  | OperatorTabsBlock<TAction>
  | OperatorDetailBlock<TAction>
  | OperatorColumnsBlock<TAction>
  | OperatorCardBlock<TAction>;

/** Standing state of the surface itself, shown beside its title. */
export interface OperatorViewStatus {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorView<
  TAction extends AnyWorkspaceActionDefinition = never,
> {
  /** Domain the surface belongs to, above the title. */
  readonly kicker?: string | undefined;
  readonly title?: string | undefined;
  /** What the surface is for, in a sentence. */
  readonly description?: string | undefined;
  readonly status?: OperatorViewStatus | undefined;
  /** The one host-positioned action; in-flow actions remain in blocks. */
  readonly primaryAction?: OperatorActionControl<TAction> | undefined;
  readonly blocks: readonly OperatorViewBlock<TAction>[];
}

export type StudioWorkspaceView<
  TAction extends AnyWorkspaceActionDefinition = never,
> = OperatorView<TAction>;

export type StudioWorkspaceViewBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> = OperatorViewBlock<TAction>;

export type DashboardOperatorLaunchIntent = Exclude<
  OperatorLaunchIntent,
  {
    readonly target:
      "inbox-open-entity" | "inbox-capture-note" | "inbox-discuss-in-chat";
  }
>;

export type DashboardOperatorLinkTarget =
  | Exclude<
      OperatorLinkTarget,
      OperatorLaunchLinkTarget | OperatorDetailLinkTarget
    >
  | { readonly launch: DashboardOperatorLaunchIntent };

export interface DashboardOperatorLinkItem {
  readonly label: string;
  readonly target: DashboardOperatorLinkTarget;
}

export interface DashboardOperatorLinksBlock extends Omit<
  OperatorLinksBlock,
  "items"
> {
  readonly items: readonly DashboardOperatorLinkItem[];
}

export interface DashboardOperatorListItem extends Omit<
  OperatorListItem<never>,
  "actions" | "actionsLabel" | "link" | "links"
> {
  readonly link?: DashboardOperatorLinkTarget | undefined;
  readonly links?: readonly DashboardOperatorLinkItem[] | undefined;
}

export interface DashboardOperatorListBlock extends Omit<
  OperatorListBlock<never>,
  "items"
> {
  readonly items: readonly DashboardOperatorListItem[];
}

export interface DashboardOperatorTableRow extends Omit<
  OperatorTableRow<never>,
  "actions" | "link"
> {
  readonly link?: DashboardOperatorLinkTarget | undefined;
}

export interface DashboardOperatorTableBlock extends Omit<
  OperatorTableBlock<never>,
  "rows"
> {
  readonly rows: readonly DashboardOperatorTableRow[];
}

export interface DashboardOperatorMatrixCell extends Omit<
  OperatorMatrixCell<never>,
  "items"
> {
  readonly items: readonly DashboardOperatorListItem[];
}

export interface DashboardOperatorMatrixBlock extends Omit<
  OperatorMatrixBlock<never>,
  "cells"
> {
  readonly cells: readonly DashboardOperatorMatrixCell[];
}

export type DashboardOperatorPanelBlock =
  | OperatorStatsBlock
  | OperatorKeyValuesBlock
  | OperatorNoticeBlock
  | OperatorGroupBlock
  | OperatorFlowBlock
  | OperatorMeterBlock
  | OperatorProgressBlock
  | DashboardOperatorLinksBlock
  | DashboardOperatorListBlock
  | DashboardOperatorTableBlock
  | DashboardOperatorMatrixBlock
  | OperatorSpatialBlock;

export interface DashboardOperatorTabsBlock {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  readonly tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly count?: number | undefined;
    readonly blocks: readonly DashboardOperatorPanelBlock[];
  }[];
}

export type DashboardOperatorViewBlock =
  DashboardOperatorPanelBlock | DashboardOperatorTabsBlock;

export interface DashboardOperatorView {
  readonly title?: string | undefined;
  readonly blocks: readonly DashboardOperatorViewBlock[];
}

export interface DashboardDigest {
  readonly items: readonly {
    readonly label: string;
    readonly value: string;
    readonly tone?: "good" | "warn" | undefined;
  }[];
  readonly attention?: number | undefined;
}
