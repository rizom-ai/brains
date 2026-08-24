import type {
  BaseEntity,
  EntityInput,
  EntityMutationResult,
  IEntityService,
} from "@brains/plugins";
import type { JobEntityAccess } from "@brains/plugins";

/**
 * The entity access a job handler sees, backed by a real entity service.
 *
 * Six tests hand-built this, differing only in whether writes were allowed
 * and what they threw — so every field added to `JobEntityAccess` broke six
 * packages that only wanted reads.
 */
export function createTestEntityAccess(options: {
  readonly entityService: IEntityService;
  /**
   * Thrown on any write. A generation returns content and the runtime
   * persists it, so a generation that writes its own entity is a defect the
   * test should catch rather than a case it should support. Omitted, writes
   * go through to the service.
   */
  readonly refuseWrites?: string;
  /** Called before each write, for a test counting attempts. */
  readonly onWrite?: () => void;
}): JobEntityAccess {
  const service = options.entityService;
  const refusal = options.refuseWrites;
  const refuse = (): never => {
    throw new Error(refusal ?? "This job must not write entities");
  };
  return {
    listEntities: (request) => service.listEntities(request),
    getEntity: (request) => service.getEntity(request),
    find: async <T extends BaseEntity>(
      entityType: string,
      identifier: string,
    ): Promise<T | null> =>
      ((await service.getEntity({ entityType, id: identifier })) ??
        (
          await service.listEntities({
            entityType,
            options: { limit: 1, filter: { metadata: { title: identifier } } },
          })
        )[0] ??
        null) as T | null,
    getEntityTypes: () => service.getEntityTypes(),
    search: (request) => service.search(request),
    get: async () => null,
    create: <T extends BaseEntity>(
      entity: EntityInput<T>,
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      return refusal === undefined
        ? service.createEntity({ entity })
        : refuse();
    },
    update: <T extends BaseEntity>(
      entity: T,
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      return refusal === undefined
        ? service.updateEntity({ entity })
        : refuse();
    },
    createPending: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<{ entityId: string; created: boolean }> => {
      options.onWrite?.();
      if (refusal !== undefined) refuse();
      const written = await service.createEntity({ entity });
      return { entityId: written.entityId, created: true };
    },
    saveProcessed: async <T extends BaseEntity>(
      entity: EntityInput<T> & { readonly id: string },
    ): Promise<EntityMutationResult> => {
      options.onWrite?.();
      if (refusal !== undefined) refuse();
      // Create-or-update, as the runtime's own helper does: a generation may
      // be filling in a placeholder or writing the entity outright.
      const existing = await service.getEntity({
        entityType: entity.entityType,
        id: entity.id,
      });
      return existing
        ? service.updateEntity({
            entity: { ...existing, ...entity },
          })
        : service.createEntity({ entity });
    },
  };
}
