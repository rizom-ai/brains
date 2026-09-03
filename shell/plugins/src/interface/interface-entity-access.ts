import type { ICoreEntityService } from "@brains/entity-service";
import type { JobEntityAccess } from "../job/job-context-contract";

/**
 * The entity access an interface's own tools get: reads, and nothing else.
 *
 * An interface declares no entity types, so there is no set for a write to
 * be checked against — every write is a trespass by construction. The
 * methods are still here because the tool contract is shared with services,
 * and refusing loudly is better than a surface that silently lacks them.
 *
 * The reads go through the core service the interface context already
 * carries, which is read-only for the same reason.
 */
export function createInterfaceEntityAccess(
  entityService: ICoreEntityService,
  interfaceId: string,
): JobEntityAccess {
  const refuse = (): never => {
    throw new Error(
      `Interface "${interfaceId}" declares no entity types, so it cannot write one`,
    );
  };
  return {
    listEntities: (request) => entityService.listEntities(request),
    getEntityCounts: (visibilityScope) =>
      entityService.getEntityCounts(visibilityScope),
    getEntity: (request) =>
      entityService.getEntity({
        entityType: request.entityType,
        id: request.id,
        ...(request.visibilityScope === undefined
          ? {}
          : { visibilityScope: request.visibilityScope }),
      }),
    find: async (entityType, identifier) =>
      entityService.getEntity({ entityType, id: identifier }),
    getEntityTypes: () => entityService.getEntityTypes(),
    search: (request) => entityService.search(request),
    get: async (definition, id) =>
      entityService.getEntity({ entityType: definition.type, id }),
    create: refuse,
    update: refuse,
    delete: refuse,
    createPending: refuse,
    saveProcessed: refuse,
  };
}
