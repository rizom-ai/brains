import {
  ENTITY_SHARING_EXTENSION_URI,
  entitySharingRequestSchema,
  SHARED_COPY_ENTITY_TYPE,
  sharedEntityStatement,
  type EntitySharingRequest,
  type SharedEntity,
  type SharedEntityListing,
} from "@brains/contracts";
import { computeContentHash } from "@brains/utils/hash";
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
 * Whether a type holds what an owner can share. A system type holds the
 * brain's own records, which are stored as shared by default and were
 * marked for nobody; a copy taken from another brain is its owner's.
 */
function isShareable(
  entityReads: InterfaceRuntime["entityReads"],
  entityType: string,
): boolean {
  return (
    entityType !== SHARED_COPY_ENTITY_TYPE &&
    entityReads.hasEntityType(entityType) &&
    entityReads.getEntityTypeConfig(entityType).classification !== "system"
  );
}

/** Sign a statement with this brain's key, naming the key. */
export type StatementSigner = (
  statement: string,
) => Promise<{ keyId: string; signature: string }>;

/**
 * The shared entity a peer may take, signed, or nothing. Nothing is the one
 * answer for every miss: a caller who is not trusted, a type the brain does
 * not have or keeps for itself, an entity that is absent, not published,
 * restricted, or public, a copy this brain took from another, or a brain
 * that cannot sign. Only
 * what an owner marked shared is served, and only its own; public entities
 * are pointed to, never copied.
 */
export async function readSharedEntity(
  entityReads: InterfaceRuntime["entityReads"],
  callerPermissionLevel: UserPermissionLevel,
  request: Extract<EntitySharingRequest, { op: "get" }> | undefined,
  sign: StatementSigner | undefined,
  now: () => Date = (): Date => new Date(),
): Promise<SharedEntity | undefined> {
  if (!request || !sign || callerPermissionLevel !== "trusted") {
    return undefined;
  }
  if (!isShareable(entityReads, request.entityType)) return undefined;
  const entity = await entityReads.getEntity({
    entityType: request.entityType,
    id: request.id,
    visibilityScope: "shared",
    publishedOnly: true,
    // The stored document: what a copy is, byte for byte.
    source: true,
  });
  if (entity?.visibility !== "shared") return undefined;
  const served = {
    entityType: entity.entityType,
    id: entity.id,
    markdown: entity.content,
    // Of the document served, so the taker can check its copy against it.
    contentHash: computeContentHash(entity.content),
  };
  const signedAt = now().toISOString();
  const signed = await sign(
    sharedEntityStatement({ ...served, attestation: { signedAt } }),
  );
  return { ...served, attestation: { signedAt, ...signed } };
}

/**
 * What this brain shares with a peer it trusts, each entity named and none
 * of its text: its own shared, published entities, of every type. Nothing
 * for a caller it does not trust.
 */
export async function listSharedEntities(
  entityReads: InterfaceRuntime["entityReads"],
  callerPermissionLevel: UserPermissionLevel,
): Promise<SharedEntityListing | undefined> {
  if (callerPermissionLevel !== "trusted") return undefined;
  const types = entityReads
    .getEntityTypes()
    .filter((entityType) => isShareable(entityReads, entityType));
  const byType = await Promise.all(
    types.map((entityType) =>
      entityReads.listEntities({
        entityType,
        options: { filter: { visibilityScope: "shared" }, publishedOnly: true },
      }),
    ),
  );
  return {
    entities: byType
      .flat()
      .filter((entity) => entity.visibility === "shared")
      .map((entity) => {
        const title = entity.metadata["title"] ?? entity.metadata["name"];
        return {
          entityType: entity.entityType,
          id: entity.id,
          title: typeof title === "string" ? title : entity.id,
        };
      }),
  };
}
