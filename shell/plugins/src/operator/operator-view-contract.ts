import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
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

export interface OperatorExternalLinkTarget {
  readonly external: string;
}

export interface OperatorEntityLinkTarget {
  readonly entity: AnyEntityDefinition;
  readonly id: string;
}

export type OperatorLinkTarget =
  OperatorExternalLinkTarget | OperatorEntityLinkTarget;

export interface OperatorLinkItem {
  readonly label: string;
  readonly target: OperatorLinkTarget;
}

export interface OperatorLinksBlock {
  readonly type: "links";
  readonly id?: string | undefined;
  readonly items: readonly OperatorLinkItem[];
}

export type OperatorActionControl<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
> = TDefinition extends AnyWorkspaceActionDefinition
  ? {
      readonly action: TDefinition;
      readonly input: WorkspaceActionInput<TDefinition>;
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

export interface OperatorListItem<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly id: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly meta?: string | undefined;
  readonly tone?: OperatorTone | undefined;
  readonly link?: OperatorLinkTarget | undefined;
  readonly actions?: readonly OperatorActionControl<TAction>[] | undefined;
}

export interface OperatorListBlock<
  TAction extends AnyWorkspaceActionDefinition,
> {
  readonly type: "list";
  readonly id: string;
  readonly empty: string;
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

export type OperatorViewBlock<
  TAction extends AnyWorkspaceActionDefinition = never,
> =
  | OperatorStatsBlock
  | OperatorKeyValuesBlock
  | OperatorNoticeBlock
  | OperatorLinksBlock
  | OperatorActionBlock<TAction>
  | OperatorActionsBlock<TAction>
  | OperatorListBlock<TAction>
  | OperatorTableBlock<TAction>;

export interface OperatorView<
  TAction extends AnyWorkspaceActionDefinition = never,
> {
  readonly title?: string | undefined;
  readonly blocks: readonly OperatorViewBlock<TAction>[];
}

export interface DashboardDigest {
  readonly items: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly attention?: number | undefined;
}
