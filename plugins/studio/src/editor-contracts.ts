import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility, ServicePluginContext } from "@brains/plugins";
import type { StudioEntityDisplayMap } from "./config";
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

/** How a type's entries nest, as Studio presents and creates them. */
export interface StudioTypeHierarchy {
  /** What a level of the hierarchy is called. */
  kind: "page" | "folder";
  /** Whether new entries may be created inside a folder. */
  nested: boolean;
}

/** One entity type in Studio's type list. */
export interface StudioEntityTypeInfo {
  entityType: string;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  count: number;
  capabilities: StudioTypeCapabilities;
  hierarchy: StudioTypeHierarchy;
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
