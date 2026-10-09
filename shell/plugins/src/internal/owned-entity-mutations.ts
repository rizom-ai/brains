import { SdkError, toSdkError } from "@brains/contracts";
import {
  EntityWriteConflictError,
  baseEntityParserSchema,
  getVisibleContentVisibilities,
  type BaseEntity,
  type ContentVisibility,
  type EntityInput,
  type EntitySchema,
  type EntityServiceClient,
} from "@brains/entity-service";
import { sha256Hex } from "@brains/utils/hash";
import { definitionEntitySchema } from "../entity/entity-schema";
import type { OwnedEntityMutationRuntime } from "./owned-entity-mutation-runtime-contract";
import { z } from "@brains/utils/zod";
import {
  issueOwnedEntityEdit,
  type OwnedEntityEdit,
  type OwnedEntityMutations,
  type OwnedMutationReceipt,
  type OwnedEntityOperation,
} from "../entity/owned-entity-mutations";

const name = z.string().min(1).max(200);
const readSchema = z.strictObject({
  entityType: name,
  id: z.string().min(1).max(500),
  visibilityScope: z.enum(["public", "shared", "restricted"]).optional(),
});
const operationSchema = z.strictObject({
  entityType: name,
  operation: name,
  key: z.string().min(1).max(500),
});
const receiptSchema = z.union([
  z.strictObject({ operation: z.literal("none") }),
  z.strictObject({
    operation: z.enum(["create", "update"]),
    entityType: name,
    entityId: z.string().min(1),
  }),
]);
const createSchema = z.object({
  entityType: name,
  id: z.string().min(1).max(500).optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  visibility: z.enum(["public", "shared", "restricted"]).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

function freezeTree<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeTree(child, seen);
    Object.freeze(value);
  }
  return value;
}

function checked<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(structuredClone(value));
  } catch (cause) {
    throw new SdkError("invalid_input", { cause });
  }
}

async function mutation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof EntityWriteConflictError)
      throw new SdkError("conflict", { cause });
    throw toSdkError(cause);
  }
}

/** The namespace is a host decision, never a string forwarded from an author. */
export interface OwnedMutationOwner {
  readonly packageName: string;
  readonly declarationId: string;
  readonly signal?: AbortSignal;
}

function receiptNamespace(
  owner: OwnedMutationOwner | undefined,
  type: string,
  operation: string,
): string {
  if (!owner) throw new SdkError("permission_denied");
  // Legacy native FAQ receipt identity must survive the declaration port. Tracked
  // with faq-ambiguous-capture-claims; old writers must stop before rollout.
  if (
    owner.packageName === "@brains/faq" &&
    owner.declarationId === "capture" &&
    type === "faq" &&
    (operation === "capture" || operation === "source-review")
  )
    return operation === "capture" ? "faq.capture" : "faq.source-review";
  return `owned-entity:${sha256Hex(JSON.stringify([owner.packageName, owner.declarationId, type, operation]))}`;
}

interface HeldEdit {
  readonly entity: BaseEntity;
  readonly revision: string;
}

/** No native snapshot, condition, write guard, attribution override or persistence origin escapes. */
export function createOwnedEntityMutationRuntime(
  service: Pick<
    EntityServiceClient,
    | "getEntityWriteSnapshot"
    | "getEntityMutationReceipt"
    | "applyEntityMutationOnce"
    | "updateEntity"
    | "deleteEntity"
    | "foldEntity"
  >,
  ownedTypes: ReadonlySet<string>,
  owner: OwnedMutationOwner | undefined,
  visibilityScope?: ContentVisibility,
): OwnedEntityMutationRuntime {
  const ownerKey = owner
    ? Object.freeze({
        packageName: owner.packageName,
        declarationId: owner.declarationId,
      })
    : undefined;
  const signal = owner?.signal;
  const owned = new Set(ownedTypes);
  const edits = new WeakMap<object, HeldEdit>();
  const assertOwned = (type: string): void => {
    // Receipts outlive their entities and cannot be re-authorized through a
    // current public/published view. This capability is for owned background
    // work, never an implicit grant from a caller-scoped callback.
    if (!ownerKey || visibilityScope !== undefined)
      throw new SdkError("permission_denied");
    if (!owned.has(type)) throw new SdkError("permission_denied");
    if (signal?.aborted) throw new SdkError("cancelled");
  };
  const scopeFor = (
    requested: ContentVisibility = "public",
  ): ContentVisibility =>
    visibilityScope === undefined ||
    getVisibleContentVisibilities(visibilityScope).includes(requested)
      ? requested
      : visibilityScope;
  const assertVisible = (visibility: ContentVisibility): void => {
    if (
      !getVisibleContentVisibilities(scopeFor("restricted")).includes(
        visibility,
      )
    )
      throw new SdkError("permission_denied");
  };
  const held = (edit: OwnedEntityEdit): HeldEdit => {
    const value = edits.get(edit);
    if (!value)
      throw new SdkError("invalid_input", {
        message: "Use an edit issued by this entity access",
      });
    assertOwned(value.entity.entityType);
    return value;
  };
  const replacement = (
    edit: OwnedEntityEdit,
    value: BaseEntity,
  ): { entity: BaseEntity; revision: string } => {
    const previous = held(edit);
    const entity = checked(baseEntityParserSchema, value);
    if (
      entity.id !== previous.entity.id ||
      entity.entityType !== previous.entity.entityType
    )
      throw new SdkError("invalid_input");
    assertVisible(entity.visibility);
    return { entity, revision: previous.revision };
  };
  const receipt = (value: unknown, type: string): OwnedMutationReceipt => {
    let result: z.output<typeof receiptSchema>;
    try {
      result = receiptSchema.parse(value);
    } catch (cause) {
      throw new SdkError("invalid_response", { cause });
    }
    if (result.operation === "none")
      return Object.freeze({ operation: "none" });
    if (result.entityType !== type) throw new SdkError("invalid_response");
    return Object.freeze({
      operation: result.operation,
      entityId: result.entityId,
    });
  };

  return Object.freeze({
    async read<T extends BaseEntity>(
      request: Parameters<OwnedEntityMutationRuntime["read"]>[0],
      schema: EntitySchema<T>,
    ): Promise<OwnedEntityEdit<T> | null> {
      const input = checked(readSchema, request);
      assertOwned(input.entityType);
      return mutation(async () => {
        const snapshot = await service.getEntityWriteSnapshot({
          ...input,
          visibilityScope: scopeFor(input.visibilityScope),
        });
        assertOwned(input.entityType);
        if (!snapshot) return null;
        // Keep the canonical state private BEFORE invoking author-supplied parsing.
        const canonical = structuredClone(snapshot);
        if (
          canonical.entity.entityType !== input.entityType ||
          canonical.entity.id !== input.id
        )
          throw new SdkError("invalid_response");
        if (
          !getVisibleContentVisibilities(
            scopeFor(input.visibilityScope),
          ).includes(canonical.entity.visibility)
        )
          return null;
        const entity = canonical.entity;
        const view = checked(schema, {
          id: entity.id,
          entityType: entity.entityType,
          content: entity.content,
          metadata: entity.metadata,
          visibility: entity.visibility,
          contentHash: entity.contentHash,
          created: entity.created,
          updated: entity.updated,
        });
        if (view.id !== entity.id || view.entityType !== entity.entityType)
          throw new SdkError("invalid_response");
        const edit = issueOwnedEntityEdit(
          freezeTree(structuredClone(view)),
          canonical.revision,
        );
        edits.set(edit, {
          entity: canonical.entity,
          revision: canonical.revision,
        });
        return edit;
      });
    },
    replace: (edit, value): Promise<void> =>
      mutation(async () => {
        const next = replacement(edit, value);
        const result = await service.updateEntity({
          entity: next.entity,
          options: {
            ...(signal ? { signal } : {}),
            conditionalWrite: { expectedRevision: next.revision },
          },
        });
        if (result.skipped) throw new SdkError("conflict");
      }),
    remove: (edit): Promise<void> =>
      mutation(async () => {
        const previous = held(edit);
        const deleted = await service.deleteEntity({
          entityType: previous.entity.entityType,
          id: previous.entity.id,
          options: {
            ...(signal ? { signal } : {}),
            conditionalWrite: { expectedRevision: previous.revision },
          },
        });
        if (!deleted) throw new SdkError("conflict");
      }),
    fold: (source, target, value): Promise<void> =>
      mutation(async () => {
        const from = held(source);
        const to = held(target);
        const next = replacement(target, value);
        if (
          from.entity.entityType !== to.entity.entityType ||
          from.entity.id === to.entity.id ||
          from.entity.visibility !== to.entity.visibility ||
          next.entity.visibility !== to.entity.visibility
        )
          throw new SdkError("invalid_input");
        await service.foldEntity({
          source: {
            entityType: from.entity.entityType,
            id: from.entity.id,
            expectedRevision: from.revision,
          },
          targetRevision: to.revision,
          entity: next.entity,
          ...(signal ? { options: { signal } } : {}),
        });
      }),
    once: (entityType, operation, key): OwnedEntityOperation => {
      const identity = checked(operationSchema, { entityType, operation, key });
      assertOwned(identity.entityType);
      const address = Object.freeze({
        namespace: receiptNamespace(
          ownerKey,
          identity.entityType,
          identity.operation,
        ),
        key: identity.key,
      });
      return Object.freeze({
        get: () =>
          mutation(async () => {
            assertOwned(identity.entityType);
            const found = await service.getEntityMutationReceipt(address);
            assertOwned(identity.entityType);
            return found ? receipt(found, identity.entityType) : null;
          }),
        complete: (proposal: Parameters<OwnedEntityOperation["complete"]>[0]) =>
          mutation(async () => {
            assertOwned(identity.entityType);
            // Snapshot a complete proposal before the first asynchronous operation.
            const operation = checked(
              z.enum(["none", "create", "update"]),
              proposal.operation,
            );
            if (operation === "none")
              return receipt(
                await service.applyEntityMutationOnce({
                  receipt: address,
                  operation: "none",
                }),
                identity.entityType,
              );
            if (!("entity" in proposal)) throw new SdkError("invalid_input");
            const value = checked(z.unknown(), proposal.entity);
            if (operation === "create") {
              const parsed = checked(createSchema, value);
              if (parsed.entityType !== identity.entityType)
                throw new SdkError("permission_denied");
              assertVisible(parsed.visibility ?? "public");
              const entity: EntityInput<BaseEntity> = {
                entityType: parsed.entityType,
                content: parsed.content,
                metadata: parsed.metadata,
                ...(parsed.id === undefined ? {} : { id: parsed.id }),
                ...(parsed.visibility === undefined
                  ? {}
                  : { visibility: parsed.visibility }),
                ...(parsed.created === undefined
                  ? {}
                  : { created: parsed.created }),
                ...(parsed.updated === undefined
                  ? {}
                  : { updated: parsed.updated }),
              };
              return receipt(
                await service.applyEntityMutationOnce({
                  receipt: address,
                  operation: "create",
                  request: {
                    entity,
                    ...(signal ? { options: { signal } } : {}),
                  },
                }),
                identity.entityType,
              );
            }
            if (!("edit" in proposal)) throw new SdkError("invalid_input");
            const next = replacement(
              proposal.edit,
              checked(baseEntityParserSchema, value),
            );
            if (next.entity.entityType !== identity.entityType)
              throw new SdkError("permission_denied");
            return receipt(
              await service.applyEntityMutationOnce({
                receipt: address,
                operation: "update",
                request: {
                  entity: next.entity,
                  options: {
                    ...(signal ? { signal } : {}),
                    conditionalWrite: { expectedRevision: next.revision },
                  },
                },
              }),
              identity.entityType,
            );
          }),
      });
    },
  } satisfies OwnedEntityMutationRuntime);
}

/** Public operations take declarations, not independently chosen type/schema pairs. */
export function createOwnedEntityMutations(
  ...args: Parameters<typeof createOwnedEntityMutationRuntime>
): OwnedEntityMutations {
  const runtime = createOwnedEntityMutationRuntime(...args);
  const matches = (type: string, edit: OwnedEntityEdit): void => {
    if (type !== edit.entity.entityType) throw new SdkError("invalid_input");
  };
  // Normalize synchronous declaration/argument failures. The async host operations
  // below already normalize their own failures, preserving their local causes.
  const prepare = <T>(run: () => T): T => {
    try {
      return run();
    } catch (cause) {
      throw toSdkError(cause, "invalid_input");
    }
  };
  const request = (
    entityType: string,
    id: string,
    visibilityScope?: ContentVisibility,
  ): Parameters<OwnedEntityMutationRuntime["read"]>[0] => ({
    entityType,
    id,
    ...(visibilityScope === undefined ? {} : { visibilityScope }),
  });
  return Object.freeze({
    read: async (definition, id, options) =>
      prepare(() =>
        runtime.read(
          request(checked(name, definition.type), id, options?.visibilityScope),
          definitionEntitySchema(definition),
        ),
      ),
    replace: async (definition, edit, entity) =>
      prepare((): Promise<void> => {
        matches(checked(name, definition.type), edit);
        return runtime.replace(edit, entity);
      }),
    remove: async (definition, edit) =>
      prepare((): Promise<void> => {
        matches(checked(name, definition.type), edit);
        return runtime.remove(edit);
      }),
    fold: async (definition, source, target, entity) =>
      prepare((): Promise<void> => {
        const type = checked(name, definition.type);
        matches(type, source);
        matches(type, target);
        return runtime.fold(source, target, entity);
      }),
    once: (definition, operation, key) =>
      prepare(() =>
        runtime.once(checked(name, definition.type), operation, key),
      ),
  } satisfies OwnedEntityMutations);
}
