import type { ActorRef } from "@brains/contracts";
import type { ContentVisibility } from "@brains/sdk/entities";
import type {
  AppendAuthAuditEventInput,
  InterfaceCaller,
} from "@brains/sdk/services";

/**
 * What a request may see and do, read off the caller the runtime resolved.
 *
 * The runtime verified the session and read the person's role out of the
 * brain's own user store; nothing here was decided by this package. The
 * visibility scope is a function of the permission level, as everywhere.
 */
export interface StudioRequestAccess {
  caller: InterfaceCaller;
  actor: Extract<ActorRef, { kind: "user" }>;
  permissionLevel: InterfaceCaller["permission"];
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

/** The audit trail a console keeps of what an operator asked for. */
export type StudioAuditRecorder =
  ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined;
