import {
  entityMutationReceiptKeySchema,
  entityRevision,
  EntityWriteConflictError,
  normalizeContentVisibility,
  type BaseEntity,
  type IEntityService,
  type EntityMutationReceipt,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import type { MockEntityStore } from "./mock-entity-store";

type ReceiptMethods = Pick<
  IEntityService,
  "getEntityMutationReceipt" | "applyEntityMutationOnce"
>;

/** The id, or the first of id-2, id-3, … no entity holds, as the real service resolves it. */
function freeId(store: MockEntityStore, id: string): string {
  const taken = (candidate: string): boolean => store.entities.has(candidate);
  if (!taken(id)) return id;
  const suffix = Array.from({ length: 99 }, (_, index) => index + 2).find(
    (candidate) => !taken(`${id}-${candidate}`),
  );
  return suffix === undefined
    ? `${id}-${crypto.randomUUID().slice(0, 8)}`
    : `${id}-${suffix}`;
}

/** The entity and receipt are installed in one synchronous map mutation. */
export function createMockReceiptMethods(
  store: MockEntityStore,
): ReceiptMethods {
  return {
    getEntityMutationReceipt: async (
      input,
    ): Promise<EntityMutationReceipt | null> => {
      const key = entityMutationReceiptKeySchema.parse(input);
      const receipt = store.mutationReceipts.get(
        JSON.stringify([key.namespace, key.key]),
      );
      return receipt ? structuredClone(receipt) : null;
    },
    applyEntityMutationOnce: async (input): Promise<EntityMutationReceipt> => {
      const key = entityMutationReceiptKeySchema.parse(input.receipt);
      const storageKey = JSON.stringify([key.namespace, key.key]);
      const prior = store.mutationReceipts.get(storageKey);
      if (prior) return structuredClone(prior);
      if (input.operation === "none") {
        store.mutationReceipts.set(storageKey, { operation: "none" });
        return { operation: "none" };
      }
      if (input.request.stagedAsset) {
        throw new Error(
          "The receipt fake does not model assets; use real storage",
        );
      }
      const operation = input.operation;
      const proposed = structuredClone(input.request.entity);
      const condition = input.request.options?.conditionalWrite && {
        ...input.request.options.conditionalWrite,
      };
      const expectedHash =
        input.operation === "update"
          ? input.request.options?.expectedContentHash
          : undefined;
      const options: NonNullable<typeof input.request.options> = {
        ...input.request.options,
      };
      const now = new Date().toISOString();
      const deduplicate =
        input.operation === "create" && input.request.options?.deduplicateId;
      const proposedId = proposed.id ?? crypto.randomUUID();
      const entity: BaseEntity = {
        ...proposed,
        id: deduplicate ? freeId(store, proposedId) : proposedId,
        contentHash: "",
        visibility: normalizeContentVisibility(proposed.visibility),
        created: proposed.created ?? now,
        updated: now,
      };
      const canonical = store.serialize(entity);
      Object.assign(entity, canonical, {
        contentHash: computeContentHash(canonical.content),
      });
      const assertCurrent = (): void => {
        const current = store.entities.get(entity.id);
        if (
          (operation === "create" && current) ||
          (operation === "update" &&
            current?.entityType !== entity.entityType) ||
          (condition &&
            (condition.expectedRevision === null
              ? !!current
              : !current ||
                entityRevision(current) !== condition.expectedRevision)) ||
          (expectedHash !== undefined && current?.contentHash !== expectedHash)
        ) {
          throw new EntityWriteConflictError(entity.entityType, entity.id);
        }
      };
      assertCurrent();
      await options.beforeWrite?.(structuredClone(entity));
      options.signal?.throwIfAborted();
      // A competing attempt may have committed while the guard was suspended.
      const winner = store.mutationReceipts.get(storageKey);
      if (winner) return structuredClone(winner);
      assertCurrent();
      const receipt: EntityMutationReceipt = {
        operation,
        entityType: entity.entityType,
        entityId: entity.id,
      };
      store.entities.set(entity.id, structuredClone(entity));
      store.types.add(entity.entityType);
      store.markExportIntent(
        entity.entityType,
        entity.id,
        "upsert",
        options.persistenceOrigin,
      );
      store.mutationReceipts.set(storageKey, receipt);
      return structuredClone(receipt);
    },
  };
}
