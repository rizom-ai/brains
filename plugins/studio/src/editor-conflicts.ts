import {
  conflictActionSchema,
  resolveConflictContract,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { StudioRequestAccess } from "./editor-contracts";
import { jsonResponse } from "./editor-response";
import type { StudioContext } from "./studio-context";

const resolveConflictPayloadSchema: z.ZodObject<{
  conflictId: z.ZodString;
  action: typeof conflictActionSchema;
}> = z.object({
  conflictId: z.string().min(1),
  action: conflictActionSchema,
});

/**
 * Apply or dismiss a conflict from the editor. The conflict service decides
 * who may: the person whose edit it holds, or an admin. An apply is held to
 * the entry's own rules there, as it is from the Inbox.
 */
export async function handleResolveConflict(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const payload = resolveConflictPayloadSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!payload.success) {
    return jsonResponse({ error: "Invalid conflict request" }, 400);
  }
  const result = await context.messaging.request(resolveConflictContract, {
    ...payload.data,
    userId: access.principal.userId,
    permissionLevel: access.permissionLevel,
  });
  if (result.status === "answered") return jsonResponse({ resolved: true });
  if (result.status === "failed") {
    return jsonResponse({ error: result.error.message }, 409);
  }
  return jsonResponse(
    { error: "Conflicts cannot be resolved here right now." },
    503,
  );
}
