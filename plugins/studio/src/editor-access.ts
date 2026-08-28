import type {
  StudioWorkspaceActor,
  ServicePluginContext,
} from "@brains/plugins";
import { jsonResponse } from "./editor-response";
import { getErrorMessage } from "@brains/utils/error";
import type {
  StudioRequestAccess,
  StudioTypeCapabilities,
  EditorRouteOptions,
} from "./editor-contracts";

export function toStudioWorkspaceActor(
  access: StudioRequestAccess,
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: access.principal.userId,
    actor: access.actor,
    userPermissionLevel: access.permissionLevel,
    visibilityScope: access.visibilityScope,
    isAnchor: access.isAnchor,
  };
}

export type StudioMutationOperation = "create" | "update" | "delete" | "upload";
export type StudioMutationOutcome = "allowed" | "denied";

export async function recordStudioMutationAudit(
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
  access: StudioRequestAccess,
  operation: StudioMutationOperation,
  outcome: StudioMutationOutcome,
  entityType: string,
  targetId?: string,
  reason?: string,
): Promise<void> {
  if (!recordAuditEvent) return;
  await recordAuditEvent({
    actorUserId: access.principal.userId,
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

export function studioMutationOptions(access: StudioRequestAccess): {
  eventContext: {
    actor: StudioRequestAccess["actor"];
    interfaceType: "studio";
  };
} {
  return {
    eventContext: {
      actor: access.actor,
      interfaceType: "studio",
    },
  };
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

export function requireEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: StudioRequestAccess,
): Response | null {
  try {
    context.permissions.assertEntityActionAllowed(entityType, action, {
      userPermissionLevel: access.permissionLevel,
    });
    return null;
  } catch (error) {
    return jsonResponse(
      {
        error: getErrorMessage(error, `Studio ${action} permission denied`),
      },
      403,
    );
  }
}

export function canPerformEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: StudioRequestAccess,
): boolean {
  try {
    context.permissions.assertEntityActionAllowed(entityType, action, {
      userPermissionLevel: access.permissionLevel,
    });
    return true;
  } catch {
    return false;
  }
}

export function deriveTypeCapabilities(
  context: ServicePluginContext,
  entityType: string,
  visibleCount: number,
  access: StudioRequestAccess,
): StudioTypeCapabilities | undefined {
  const canCreate = canPerformEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  const canUpdate = canPerformEntityAction(
    context,
    entityType,
    "update",
    access,
  );
  const canDelete = canPerformEntityAction(
    context,
    entityType,
    "delete",
    access,
  );
  const canExtract = canPerformEntityAction(
    context,
    entityType,
    "extract",
    access,
  );
  const canPublish = canPerformEntityAction(
    context,
    entityType,
    "publish",
    access,
  );
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
  context: ServicePluginContext,
  entityType: string,
  access: StudioRequestAccess,
): Promise<StudioTypeCapabilities | undefined> {
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return undefined;
  }
  const visibleCount = await context.entityService.countEntities({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return deriveTypeCapabilities(context, entityType, visibleCount, access);
}
