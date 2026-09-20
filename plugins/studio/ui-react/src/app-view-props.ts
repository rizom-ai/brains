import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  EntityIdPath,
} from "@brains/plugins";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { GroupingNavigation } from "./grouping-url-query";
import type {
  AgentTarget,
  StudioWorkspaceInfo,
  EntitySummary,
  EntityFolder,
  DestinationPreview,
  EntityTypeInfo,
  PublishingAction,
  PublishingActionResult,
  SyncStatus,
  TypeSchema,
} from "./api";
import type { BodyMode } from "./body-editor";
import type { StudioWorkspaceQuery } from "./queries";
import type { FieldAssistState, FieldAssistVariant } from "./entity-fields";
import type {
  EditorWorkflowAction,
  EditorWorkflowState,
} from "./editor-workflow";
import type { StudioCollectionQuery } from "../../src/collection-query";

export type MobileEditorPane = "details" | "write" | "preview";

export interface StudioAppViewProps {
  groupings?: GroupingNavigation | undefined;
  groupingView?: ReactNode;
  groupReturnLabel?: string | undefined;
  /** Existing values per grouping field, offered while editing membership. */
  groupingSuggestions?: Record<string, readonly string[]> | undefined;
  activeWorkspaceId: string | null;
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  workspaceError: string | null;
  readError?: string | null;
  onRetryRead?: () => void;
  declarativeWorkspaceData: RuntimeStudioWorkspaceData | null;
  workspaceQuery: StudioWorkspaceQuery;
  entityType: string | null;
  entities: EntitySummary[] | null;
  folders: EntityFolder[];
  collectionPath: string;
  selectFolder: (prefix: EntityIdPath | null) => void;
  creationDestination: {
    data: DestinationPreview | null;
    pending: boolean;
    error: Error | null;
  };
  entityOffset: number;
  entityLimit: number;
  entityTotal: number;
  collectionQuery: StudioCollectionQuery;
  onCollectionQueryChange: (query: StudioCollectionQuery) => void;
  entityListLoading: boolean;
  schema: TypeSchema | null;
  editor: EditorWorkflowState;
  fieldAssistState: FieldAssistState;
  bodyMode: BodyMode;
  mobilePane: MobileEditorPane;
  syncStatus: SyncStatus | null;
  baselineCommit: string | null;
  agentTargets: AgentTarget[];
  deleting: boolean;
  hasUnsavedChanges: boolean;
  navigationBlocked: boolean;
  dispatchEditor: Dispatch<EditorWorkflowAction>;
  setFieldAssistState: Dispatch<SetStateAction<FieldAssistState>>;
  setBodyMode: Dispatch<SetStateAction<BodyMode>>;
  setMobilePane: (pane: MobileEditorPane) => void;
  backToList: () => void;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  changeEntityPage: (offset: number) => void;
  openWorkspaceEntity: (entityType: string, entityId: string) => void;
  openWorkspaceLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  performPublishingAction: (
    action: PublishingAction,
  ) => Promise<PublishingActionResult>;
  performDeclarativeAction: (
    action: RuntimeOperatorActionControl,
  ) => Promise<unknown>;
  onWorkspaceQueryChange: (
    workspaceId: string,
    query: StudioWorkspaceQuery,
    canonicalUrlQuery?: StudioWorkspaceQuery,
  ) => void;
  startCreate: () => void;
  openEntity: (entityId: string) => void;
  runFieldAssist: (variant: FieldAssistVariant, field: string) => void;
  applyFieldAssist: (field: string, suggestion: string | string[]) => void;
  save: () => void;
  remove: () => void;
  onNavigationReset: () => void;
  onNavigationProceed: () => void;
}
