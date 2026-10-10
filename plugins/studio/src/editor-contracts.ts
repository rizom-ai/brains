import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type { ActorRef } from "@brains/contracts";
import type {
  ContentVisibility,
  ServicePluginContext,
  EntityTypeClassification,
} from "@brains/plugins";
import type { StudioEntityDisplayMap, StudioTypeHierarchy } from "./config";
import type { GroupingDefinitionsSnapshot } from "./grouping-definitions-contract";
import type { StudioWorkspaceRegistry } from "./workspace-registry";

export const STUDIO_ENTITY_PAGE_LIMIT = 25;

export interface StudioRequestAccess {
  principal: AuthPrincipal;
  actor: Extract<ActorRef, { kind: "user" }>;
  permissionLevel: AuthPrincipal["permissionLevel"];
  visibilityScope: ContentVisibility;
  isAnchor: boolean;
}

export interface StudioTypeCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExtract: boolean;
  canPublish: boolean;
  canAssist: boolean;
}

/** One entity type in Studio's type list. */
export interface StudioEntityTypeInfo {
  entityType: string;
  classification: EntityTypeClassification;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  count: number;
  capabilities: StudioTypeCapabilities;
  hierarchy: StudioTypeHierarchy;
  /** The type this one lives in; Studio shows it inside that type, not on its own. */
  containedIn?: string | undefined;
}

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/studio". */
  routePath: string;
  getContext: () => ServicePluginContext;
  resolveAuthPrincipal: (
    request: Request,
  ) => Promise<AuthPrincipal | undefined>;
  getEntityDisplay: () => StudioEntityDisplayMap | undefined;
  workspaceRegistry: StudioWorkspaceRegistry;
  getGroupingDefinitions?: () => GroupingDefinitionsSnapshot;
  recordAuditEvent?:
    ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined;
}

export type StudioRequestAccessResolution =
  | { state: "allowed"; access: StudioRequestAccess }
  | { state: "unauthenticated" };
