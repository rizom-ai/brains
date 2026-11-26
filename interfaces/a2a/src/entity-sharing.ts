import {
  ENTITY_SHARING_EXTENSION_URI,
  entitySharingRequestSchema,
  type EntitySharingRequest,
  type SharedEntity,
} from "@brains/contracts";
import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";
import type { UserPermissionLevel } from "@brains/sdk/interfaces";
import { z } from "@brains/utils/zod";

const EXTENSIONS_HEADER = "x-a2a-extensions";

const dataPartsSchema = z.looseObject({
  message: z.looseObject({
    parts: z.array(z.looseObject({ kind: z.string(), data: z.unknown() })),
  }),
});

/** Whether a request asks for the entity-sharing extension. */
export function asksForEntitySharing(headers: Headers): boolean {
  return (headers.get(EXTENSIONS_HEADER) ?? "")
    .split(",")
    .some((uri) => uri.trim() === ENTITY_SHARING_EXTENSION_URI);
}

/** The entity a `message/send` names in a data part, when it names one. */
export function entitySharingRequestOf(
  params: unknown,
): EntitySharingRequest | undefined {
  const parsed = dataPartsSchema.safeParse(params);
  if (!parsed.success) return undefined;
  return parsed.data.message.parts
    .filter((part) => part.kind === "data")
    .map((part) => entitySharingRequestSchema.safeParse(part.data))
    .find((request) => request.success)?.data;
}

/**
 * The shared entity a peer may take, or nothing. Nothing is the one answer
 * for every miss: a caller who is not trusted, a type the brain does not
 * have, an entity that is absent, not published, restricted, or public.
 * Only what an owner marked shared is served; public entities are pointed
 * to, never copied.
 */
export async function readSharedEntity(
  entityReads: InterfaceRuntime["entityReads"],
  callerPermissionLevel: UserPermissionLevel,
  request: EntitySharingRequest | undefined,
): Promise<SharedEntity | undefined> {
  if (!request || callerPermissionLevel !== "trusted") return undefined;
  if (!entityReads.hasEntityType(request.entityType)) return undefined;
  const entity = await entityReads.getEntity({
    entityType: request.entityType,
    id: request.id,
    visibilityScope: "shared",
    publishedOnly: true,
    // The stored document: what a copy is, byte for byte.
    source: true,
  });
  if (entity?.visibility !== "shared") return undefined;
  return {
    entityType: entity.entityType,
    id: entity.id,
    markdown: entity.content,
    contentHash: entity.contentHash,
  };
}
