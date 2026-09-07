import type {
  AppendAuthAuditEventInput,
  InterfaceCaller,
  OperatorEntityWrites,
  ServiceEntityShapes,
  StudioWorkspaceActor,
} from "@brains/sdk/services";
import { permissionToVisibilityScope } from "@brains/sdk/entities";
import { jsonResponse } from "./editor-response";
import type {
  StudioRequestAccess,
  StudioTypeCapabilities,
} from "./editor-contracts";
import type { StudioEntityReads } from "./runtime";

/**
 * What a request is allowed to see and do, read off the caller the runtime
 * resolved. The visibility scope is a function of the permission level, as
 * it is everywhere else.
 */
export function accessFor(caller: InterfaceCaller): StudioRequestAccess {
  return {
    caller,
    actor: {
      kind: "user",
      userId: caller.actor.id,
      ...(caller.actor.canonicalId !== undefined
        ? { canonicalId: caller.actor.canonicalId }
        : {}),
    },
    permissionLevel: caller.permission,
    visibilityScope: permissionToVisibilityScope(caller.permission),
    isAnchor: caller.isAnchor,
  };
}

export function toStudioWorkspaceActor(
  access: StudioRequestAccess,
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: access.caller.actor.id,
    actor: access.actor,
    userPermissionLevel: access.permissionLevel,
    visibilityScope: access.visibilityScope,
    isAnchor: access.isAnchor,
  };
}

export type StudioMutationOperation = "create" | "update" | "delete" | "upload";
export type StudioMutationOutcome = "allowed" | "denied";

export async function recordStudioMutationAudit(
  recordAuditEvent:
    ((event: AppendAuthAuditEventInput) => Promise<void>) | undefined,
  access: StudioRequestAccess,
  operation: StudioMutationOperation,
  outcome: StudioMutationOutcome,
  entityType: string,
  targetId?: string,
  reason?: string,
): Promise<void> {
  if (!recordAuditEvent) return;
  await recordAuditEvent({
    actorUserId: access.caller.actor.id,
    action: `studio.entity.${operation}.${outcome}`,
    targetType: "entity",
    ...(targetId ? { targetId } : {}),
    metadata: {
      entityType,
      interfaceType: "studio",
      outcome,
      ...(reason ? { reason } : {}),
    },
  });
}

/** Who a console write is attributed to, on the mutation event. */
export function studioEventContext(access: StudioRequestAccess): {
  actor: StudioRequestAccess["actor"];
  interfaceType: "studio";
} {
  return { actor: access.actor, interfaceType: "studio" };
}

export function requireTrustedCapability(
  access: StudioRequestAccess,
): Response | null {
  return access.permissionLevel === "public"
    ? jsonResponse({ error: "Trusted Studio capability required" }, 403)
    : null;
}

export function requireAdminCapability(
  access: StudioRequestAccess,
): Response | null {
  return access.permissionLevel === "admin"
    ? null
    : jsonResponse({ error: "Admin Studio capability required" }, 403);
}

type StudioEntityAction =
  "create" | "update" | "delete" | "extract" | "publish";

/** The refusal a route answers when the brain's policy says no. */
export function requireEntityAction(
  operator: OperatorEntityWrites,
  entityType: string,
  action: StudioEntityAction,
  access: StudioRequestAccess,
): Response | null {
  const refusal = operator.refusal(entityType, action, access.caller);
  return refusal === undefined ? null : jsonResponse({ error: refusal }, 403);
}

export function deriveTypeCapabilities(
  operator: OperatorEntityWrites,
  entityType: string,
  visibleCount: number,
  access: StudioRequestAccess,
): StudioTypeCapabilities | undefined {
  const can = (action: StudioEntityAction): boolean =>
    operator.allows(entityType, action, access.caller);
  const canCreate = can("create");
  const canUpdate = can("update");
  const canDelete = can("delete");
  const canExtract = can("extract");
  const canPublish = can("publish");
  const canRead =
    visibleCount > 0 ||
    canCreate ||
    canUpdate ||
    canDelete ||
    canExtract ||
    canPublish;
  if (!canRead) return undefined;

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    canExtract,
    canPublish,
    canAssist: canUpdate,
  };
}

export async function getTypeCapabilities(
  runtime: {
    readonly shapes: ServiceEntityShapes;
    readonly operator: OperatorEntityWrites;
    readonly entities: Pick<StudioEntityReads, "count">;
  },
  entityType: string,
  access: StudioRequestAccess,
): Promise<StudioTypeCapabilities | undefined> {
  if (!runtime.shapes.frontmatterSchema(entityType)) {
    return undefined;
  }
  const visibleCount = await runtime.entities.count({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return deriveTypeCapabilities(
    runtime.operator,
    entityType,
    visibleCount,
    access,
  );
}
