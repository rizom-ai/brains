import type { JsonValue } from "@brains/contracts";
import type { OperatorFieldControl } from "./operator-field-contract";
import type {
  OperatorKeyValueItem,
  OperatorKeyValuesBlock,
  OperatorMeterBlock,
  OperatorMeterItem,
  OperatorNoticeBlock,
  OperatorProgressBlock,
  OperatorScalar,
  OperatorStatItem,
  OperatorStatsBlock,
  OperatorTextBlock,
  OperatorTone,
} from "./operator-view-contract";

// The renderer's names for the contract's types. A plugin authors an
// OperatorStatsBlock and studio renders a RuntimeOperatorStatsBlock; they
// were two hand-written interfaces that happened to agree, and are now one.
export type RuntimeOperatorScalar = OperatorScalar;
export type RuntimeOperatorTone = OperatorTone;

export type RuntimeOperatorLaunchIntent =
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

export type RuntimeOperatorStatItem = OperatorStatItem;
export type RuntimeOperatorStatsBlock = OperatorStatsBlock;
export type RuntimeOperatorKeyValueItem = OperatorKeyValueItem;
export type RuntimeOperatorKeyValuesBlock = OperatorKeyValuesBlock;
export type RuntimeOperatorNoticeBlock = OperatorNoticeBlock;
export type RuntimeOperatorTextBlock = OperatorTextBlock;

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

export type RuntimeOperatorMeterItem = OperatorMeterItem;
export type RuntimeOperatorMeterBlock = OperatorMeterBlock;
export type RuntimeOperatorProgressBlock = OperatorProgressBlock;

export interface RuntimeOperatorQueryOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number | undefined;
}

export interface RuntimeOperatorQueryDefinition {
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

export interface RuntimeOperatorQueryBlock extends RuntimeOperatorQueryDefinition {
  readonly type: "query";
  readonly id: string;
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
  readonly presentation?:
    "standard" | "editorial" | "attention" | "activity" | undefined;
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

export interface RuntimeOperatorTableCompactRow {
  readonly title: string;
  readonly description?: string | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly badges?: readonly RuntimeOperatorBadge[] | undefined;
  readonly count?: number | undefined;
  readonly tone?: RuntimeOperatorTone | undefined;
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

export interface RuntimeWorkspaceActionFormField {
  readonly name: string;
  readonly label: string;
  readonly control: OperatorFieldControl;
  readonly required: boolean;
  readonly secret?: boolean | undefined;
  readonly options?:
    readonly { readonly value: string; readonly label: string }[] | undefined;
  readonly labelBy?:
    | {
        readonly field: string;
        readonly values: readonly {
          readonly value: string;
          readonly label: string;
        }[];
      }
    | undefined;
}

export interface RuntimeWorkspaceActionForm {
  readonly presentation?: "inline" | "disclosure" | undefined;
  readonly submitLabel?: string | undefined;
  readonly fields: readonly RuntimeWorkspaceActionFormField[];
}

export interface RuntimeWorkspaceActionResultField {
  readonly name: string;
  readonly label: string;
  readonly copyable?: boolean | undefined;
  readonly sensitive?: boolean | undefined;
}

export interface RuntimeWorkspaceActionResult {
  readonly title: string;
  readonly fields: readonly RuntimeWorkspaceActionResultField[];
}

export interface RuntimeOperatorActionControl {
  readonly actionId: string;
  readonly capabilityId?: string | undefined;
  readonly label: string;
  readonly input: JsonValue;
  readonly form?: RuntimeWorkspaceActionForm | undefined;
  readonly result?: RuntimeWorkspaceActionResult | undefined;
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

export interface RuntimeStudioOperatorListItem extends RuntimeOperatorListItem {
  readonly actionsLabel?: string | undefined;
  readonly actions?: readonly RuntimeOperatorActionControl[] | undefined;
}

export interface RuntimeStudioOperatorListBlock extends Omit<
  RuntimeOperatorListBlock,
  "items"
> {
  readonly items: readonly RuntimeStudioOperatorListItem[];
}

export interface RuntimeStudioOperatorTableRow extends RuntimeOperatorTableRow {
  readonly compact?: RuntimeOperatorTableCompactRow | undefined;
  readonly actions?: readonly RuntimeOperatorActionControl[] | undefined;
}

export interface RuntimeStudioOperatorTableBlock extends Omit<
  RuntimeOperatorTableBlock,
  "rows"
> {
  readonly query?: RuntimeOperatorQueryDefinition | undefined;
  readonly rows: readonly RuntimeStudioOperatorTableRow[];
}

export interface RuntimeStudioOperatorActionBlock extends RuntimeOperatorActionControl {
  readonly type: "action";
  readonly id?: string | undefined;
}

export interface RuntimeStudioOperatorActionsBlock {
  readonly type: "actions";
  readonly id?: string | undefined;
  readonly items: readonly RuntimeOperatorActionControl[];
}

export type RuntimeStudioOperatorPanelBlock =
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
  | RuntimeStudioOperatorListBlock
  | RuntimeStudioOperatorTableBlock
  | RuntimeOperatorMatrixBlock<RuntimeStudioOperatorListItem>
  | RuntimeOperatorSpatialBlock
  | RuntimeStudioOperatorActionBlock
  | RuntimeStudioOperatorActionsBlock;

export interface RuntimeStudioOperatorTabsBlock {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  readonly queryKey?: string | undefined;
  readonly tabs: readonly {
    readonly id: string;
    readonly label: string;
    readonly count?: number | undefined;
    readonly blocks: readonly (
      | RuntimeStudioOperatorPanelBlock
      | RuntimeStudioOperatorCardBlock
      | RuntimeStudioOperatorDetailBlock
      | RuntimeStudioOperatorColumnsBlock
    )[];
  }[];
}

export interface RuntimeStudioOperatorDetailBlock {
  readonly type: "detail";
  readonly id: string;
  readonly queryKey: string;
  readonly empty: string;
  readonly master:
    RuntimeStudioOperatorListBlock | RuntimeStudioOperatorTableBlock;
  readonly open?:
    | {
        readonly forId: string;
        readonly title: string;
        readonly blocks: readonly RuntimeStudioOperatorRegionBlock[];
      }
    | undefined;
}

export interface RuntimeStudioOperatorCardBlock {
  readonly disclosureLabel?: string | undefined;
  readonly type: "card";
  readonly id: string;
  readonly label: string;
  readonly presentation?: "section" | "disclosure" | "feature" | undefined;
  readonly metadata?: readonly string[] | undefined;
  readonly tone?: "good" | "warn" | "neutral" | "error" | undefined;
  readonly blocks: readonly RuntimeStudioOperatorPanelBlock[];
}

export type RuntimeStudioOperatorRegionBlock =
  RuntimeStudioOperatorPanelBlock | RuntimeStudioOperatorCardBlock;

export interface RuntimeStudioOperatorColumnsBlock {
  readonly type: "columns";
  readonly id: string;
  readonly primary: readonly RuntimeStudioOperatorRegionBlock[];
  readonly aside: readonly RuntimeStudioOperatorRegionBlock[];
}

export type RuntimeStudioOperatorBlock =
  | RuntimeStudioOperatorPanelBlock
  | RuntimeStudioOperatorTabsBlock
  | RuntimeStudioOperatorDetailBlock
  | RuntimeStudioOperatorColumnsBlock
  | RuntimeStudioOperatorCardBlock;

export interface RuntimeStudioOperatorViewStatus {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly tone?: "good" | "warn" | "neutral" | "error" | undefined;
}

export interface RuntimeStudioOperatorView {
  readonly kicker?: string | undefined;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly status?: RuntimeStudioOperatorViewStatus | undefined;
  readonly primaryAction?: RuntimeOperatorActionControl | undefined;
  readonly blocks: readonly RuntimeStudioOperatorBlock[];
}

export interface RuntimeStudioWorkspaceData {
  readonly view: RuntimeStudioOperatorView;
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
