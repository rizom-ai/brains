import { generateFromSourcesContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { canPerformEntityAction } from "./editor-access";
import { entityTypeLabels, type StudioEntityDisplayMap } from "./config";
import type { StudioRequestAccess } from "./editor-contracts";
import { jsonResponse } from "./editor-response";
import type { StudioContext } from "./studio-context";

/** The type a collection's entries are refined into, and what one is called. */
export interface StudioRefineTarget {
  entityType: string;
  label: string;
}

/**
 * What a collection's entries are refined into, for this caller: the type
 * whose generation uses them up, when the caller may delete the entries and
 * create that type. No such type, or no such permission, and Studio offers
 * no Refine there.
 */
export function refineTargetOf(
  context: StudioContext,
  entityType: string,
  access: StudioRequestAccess,
  entityDisplay?: StudioEntityDisplayMap,
): StudioRefineTarget | undefined {
  const target = context.entityService
    .getEntityTypes()
    .find((candidate) =>
      context.entityService
        .getEntityTypeConfig(candidate)
        .consumesSources?.includes(entityType),
    );
  if (
    target === undefined ||
    !canPerformEntityAction(context, entityType, "delete", access) ||
    !canPerformEntityAction(context, target, "create", access)
  ) {
    return undefined;
  }
  return {
    entityType: target,
    label: entityTypeLabels(target, entityDisplay?.[target]).label,
  };
}

const refinePayloadSchema = z
  .object({
    entityType: z.string().min(1),
    ids: z
      .array(z.string().min(1))
      .min(1)
      .max(51)
      .refine((ids) => new Set(ids).size === ids.length, "Ids must be unique"),
    /** What the writing should focus on; blank is none. */
    direction: z.string().max(2_000).optional(),
    /** The approval a confirmation handed out, sent back unchanged. */
    approval: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * Refine the picked entries into one: without an approval, ask the system
 * for the confirmation to put to the caller; with the approval it handed
 * out, run it. Both go through the system's own generation, as the caller,
 * so Studio confirms and refuses in the words chat does.
 */
export async function handleRefine(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
  entityDisplay?: StudioEntityDisplayMap,
): Promise<Response> {
  const payload = refinePayloadSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!payload.success) {
    return jsonResponse({ error: "Invalid refine request" }, 400);
  }
  const { entityType, ids, approval } = payload.data;
  const refinable = context.entityService
    .getEntityTypes()
    .some((candidate) =>
      context.entityService
        .getEntityTypeConfig(candidate)
        .consumesSources?.includes(entityType),
    );
  if (!refinable) {
    return jsonResponse({ error: `Nothing refines ${entityType}` }, 400);
  }
  const target = refineTargetOf(context, entityType, access, entityDisplay);
  if (!target) {
    return jsonResponse({ error: "Refining needs delete permission" }, 403);
  }
  const direction = payload.data.direction?.trim();
  const result = await context.messaging.request(generateFromSourcesContract, {
    entityType: target.entityType,
    source: { entityType, entityIds: ids },
    ...(direction && { prompt: direction }),
    ...(approval && { approval }),
    actor: access.actor,
    interfaceType: "studio",
    userPermissionLevel: access.permissionLevel,
  });
  if (result.status !== "answered") {
    return jsonResponse({ error: "Refining is unavailable" }, 503);
  }
  const answer = result.data;
  if (answer.status === "refused") {
    return jsonResponse(
      { error: answer.error },
      answer.code === "source-not-found" ? 404 : 422,
    );
  }
  if (answer.status === "confirm") {
    return jsonResponse({
      status: "confirm",
      summary: answer.summary,
      approval: answer.approval,
    });
  }
  return jsonResponse({
    status: "queued",
    entityType: target.entityType,
    entityId: answer.entityId,
  });
}
