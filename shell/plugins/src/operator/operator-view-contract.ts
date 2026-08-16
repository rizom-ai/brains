import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import { assertIdentifier } from "../package-definition";
import { assertText } from "./contract-assertions";
import type {
  AnyWorkspaceActionDefinition,
  WorkspaceActionInput,
} from "./workspace-action-definition-contract";

export type OperatorTone = "good" | "warn" | "neutral" | "error";
export type OperatorScalar = string | number | boolean | null;

export interface OperatorStatItem {
  readonly label: string;
  readonly value: string | number;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorStatsBlock {
  readonly type: "stats";
  readonly id?: string | undefined;
  readonly items: readonly OperatorStatItem[];
}

export interface OperatorKeyValueItem {
  readonly label: string;
  readonly value: OperatorScalar;
}

export interface OperatorKeyValuesBlock {
  readonly type: "key-values";
  readonly id?: string | undefined;
  readonly items: readonly OperatorKeyValueItem[];
}

export interface OperatorNoticeBlock {
  readonly type: "notice";
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly text: string;
  readonly tone?: OperatorTone | undefined;
}

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

export interface OperatorMeterItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly max?: number | undefined;
  readonly unit?: string | undefined;
  readonly tone?: OperatorTone | undefined;
}

export interface OperatorMeterBlock {
  readonly type: "meters";
  readonly id: string;
  readonly items: readonly OperatorMeterItem[];
}

export interface OperatorProgressBlock {
  readonly type: "progress";
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly detail?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly progress?: number | undefined;
  readonly tone?: OperatorTone | undefined;
}

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

export interface OperatorQueryBlock {
  readonly type: "query";
  readonly id: string;
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

export interface OperatorEntityLinkTarget {
  readonly entity: AnyEntityDefinition;
  readonly id: string;
}

export type OperatorLaunchIntent =
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

export interface OperatorCatalogEntityLinkTarget {
  readonly catalog: OperatorEntityCatalogDefinition;
  readonly entityType: string;
  readonly id: string;
}

export interface OperatorLaunchLinkTarget {
  readonly launch: OperatorLaunchIntent;
}

export type OperatorLinkTarget =
  | OperatorExternalLinkTarget
  | OperatorEntityLinkTarget
  | OperatorCatalogEntityLinkTarget
  | OperatorLaunchLinkTarget;

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

export type OperatorActionControl<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
> = TDefinition extends AnyWorkspaceActionDefinition
  ? {
      readonly action: TDefinition;
      readonly input: WorkspaceActionInput<TDefinition>;
      readonly capability?: OperatorCapabilityDefinition | undefined;
      readonly disabled?: boolean | undefined;
    }
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
  | OperatorGroupBlock
  | OperatorFlowBlock
  | OperatorMeterBlock
  | OperatorProgressBlock
  | OperatorQueryBlock
  | OperatorLinksBlock
  | OperatorActionBlock<TAction>
  | OperatorActionsBlock<TAction>
  | OperatorListBlock<TAction>
  | OperatorTableBlock<TAction>
  | OperatorMatrixBlock<TAction>
  | OperatorSpatialBlock;

export interface OperatorTabPanel<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly blocks: readonly OperatorPanelBlock<TAction>[];
}

export interface OperatorTabsBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "tabs";
  readonly id: string;
  readonly label: string;
  readonly defaultTab: string;
  readonly tabs: readonly OperatorTabPanel<TAction>[];
}

export type OperatorViewBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> = OperatorPanelBlock<TAction> | OperatorTabsBlock<TAction>;

export interface OperatorView<
  TAction extends AnyWorkspaceActionDefinition = never,
> {
  readonly title?: string | undefined;
  readonly blocks: readonly OperatorViewBlock<TAction>[];
}

export type CmsWorkspaceView<
  TAction extends AnyWorkspaceActionDefinition = never,
> = OperatorView<TAction>;

export type CmsWorkspaceViewBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> = OperatorViewBlock<TAction>;

export type DashboardOperatorLaunchIntent = Exclude<
  OperatorLaunchIntent,
  {
    readonly target:
      | "inbox-open-entity"
      | "inbox-capture-note"
      | "inbox-discuss-in-chat";
  }
>;

export type DashboardOperatorLinkTarget =
  | Exclude<OperatorLinkTarget, OperatorLaunchLinkTarget>
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
  "actions" | "link" | "links"
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
