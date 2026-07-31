import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility, ServicePluginContext } from "@brains/plugins";
import type { CmsEntityDisplayMap } from "./config";
import type { CmsWorkspaceRegistry } from "./workspace-registry";

export interface CmsRequestAccess {
  principal: AuthPrincipal;
  actor: Extract<ActorRef, { kind: "user" }>;
  permissionLevel: "trusted" | "admin";
  visibilityScope: Extract<ContentVisibility, "shared" | "restricted">;
  isAnchor: boolean;
}

export interface CmsTypeCapabilities {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExtract: boolean;
  canPublish: boolean;
  canAssist: boolean;
}

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/cms". */
  routePath: string;
  getContext: () => ServicePluginContext;
  resolveAuthPrincipal: (
    request: Request,
  ) => Promise<AuthPrincipal | undefined>;
  /** Atomic rollout gate. Production remains Admin-only through Phase 4. */
  minimumPermissionLevel: "trusted" | "admin";
  getEntityDisplay: () => CmsEntityDisplayMap | undefined;
  workspaceRegistry: CmsWorkspaceRegistry;
  recordAuditEvent?:
    ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined;
}

export type CmsRequestAccessResolution =
  | { state: "allowed"; access: CmsRequestAccess }
  | { state: "unauthenticated" }
  | { state: "forbidden" };
