import type {
  AppendAuthAuditEventInput,
  AuthPrincipal,
} from "@brains/auth-service";
import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility, ServicePluginContext } from "@brains/plugins";
import type { StudioEntityDisplayMap } from "./config";
import type { StudioWorkspaceRegistry } from "./workspace-registry";

export interface StudioRequestAccess {
  principal: AuthPrincipal;
  actor: Extract<ActorRef, { kind: "user" }>;
  permissionLevel: "trusted" | "admin";
  visibilityScope: Extract<ContentVisibility, "shared" | "restricted">;
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

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/studio". */
  routePath: string;
  getContext: () => ServicePluginContext;
  resolveAuthPrincipal: (
    request: Request,
  ) => Promise<AuthPrincipal | undefined>;
  /** Atomic rollout gate. Production remains Admin-only through Phase 4. */
  minimumPermissionLevel: "trusted" | "admin";
  getEntityDisplay: () => StudioEntityDisplayMap | undefined;
  workspaceRegistry: StudioWorkspaceRegistry;
  recordAuditEvent?:
    ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined;
}

export type StudioRequestAccessResolution =
  | { state: "allowed"; access: StudioRequestAccess }
  | { state: "unauthenticated" }
  | { state: "forbidden" };
