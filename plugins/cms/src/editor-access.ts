import type { CmsWorkspaceActor, ServicePluginContext } from "@brains/plugins";
import { jsonResponse } from "./editor-response";
import { getErrorMessage } from "@brains/utils/error";
import type {
  CmsRequestAccess,
  CmsTypeCapabilities,
  EditorRouteOptions,
} from "./editor-contracts";

export function toCmsWorkspaceActor(
  access: CmsRequestAccess,
): CmsWorkspaceActor {
  return {
    interfaceType: "cms",
    userId: access.principal.userId,
    actor: access.actor,
    userPermissionLevel: access.permissionLevel,
    visibilityScope: access.visibilityScope,
    isAnchor: access.isAnchor,
  };
}

export type CmsMutationOperation = "create" | "update" | "delete" | "upload";
export type CmsMutationOutcome = "allowed" | "denied";

export async function recordCmsMutationAudit(
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
  access: CmsRequestAccess,
  operation: CmsMutationOperation,
  outcome: CmsMutationOutcome,
  entityType: string,
  targetId?: string,
  reason?: string,
): Promise<void> {
  if (!recordAuditEvent) return;
  await recordAuditEvent({
    actorUserId: access.principal.userId,
    action: `cms.entity.${operation}.${outcome}`,
    targetType: "entity",
    ...(targetId ? { targetId } : {}),
    metadata: {
      entityType,
      interfaceType: "cms",
      outcome,
      ...(reason ? { reason } : {}),
    },
  });
}

export function cmsMutationOptions(access: CmsRequestAccess): {
  eventContext: {
    actor: CmsRequestAccess["actor"];
    interfaceType: "cms";
  };
} {
  return {
    eventContext: {
      actor: access.actor,
      interfaceType: "cms",
    },
  };
}

export function requireAdminCapability(
  access: CmsRequestAccess,
): Response | null {
  return access.permissionLevel === "admin"
    ? null
    : jsonResponse({ error: "Admin CMS capability required" }, 403);
}

export function requireEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: CmsRequestAccess,
): Response | null {
  try {
    context.permissions.assertEntityActionAllowed(entityType, action, {
      userPermissionLevel: access.permissionLevel,
    });
    return null;
  } catch (error) {
    return jsonResponse(
      {
        error: getErrorMessage(error, `CMS ${action} permission denied`),
      },
      403,
    );
  }
}

export function canPerformEntityAction(
  context: ServicePluginContext,
  entityType: string,
  action: "create" | "update" | "delete" | "extract" | "publish",
  access: CmsRequestAccess,
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
  access: CmsRequestAccess,
): CmsTypeCapabilities | undefined {
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
  access: CmsRequestAccess,
): Promise<CmsTypeCapabilities | undefined> {
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return undefined;
  }
  const visibleCount = await context.entityService.countEntities({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return deriveTypeCapabilities(context, entityType, visibleCount, access);
}
