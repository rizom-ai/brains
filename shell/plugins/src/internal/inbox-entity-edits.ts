import { SdkError, toSdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  baseEntityParserSchema,
  EntityWriteConflictError,
  getPublishBoundaryState,
  getVisibleContentVisibilities,
  permissionToVisibilityScope,
  type BaseEntity,
  type EntityServiceClient,
} from "@brains/entity-service";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type { InterfaceCaller } from "../interface/route-contract";
import { assertRouteCaller, routeCallerSignal } from "./route-caller-authority";
import { definitionEntitySchema } from "../entity/entity-schema";
import {
  issueOwnedEntityEdit,
  type OwnedEntityEdit,
} from "../entity/owned-entity-mutations";
import type { InboxEntityEdits } from "../entity/inbox-entity-edits";

interface HeldEdit {
  readonly entity: BaseEntity;
  readonly revision: string;
}
const name = z.string().min(1).max(200);
const identifier = z.string().min(1).max(500);
function freezeTree<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freezeTree(child, seen);
    Object.freeze(value);
  }
  return value;
}
async function safe<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof EntityWriteConflictError)
      throw new SdkError("conflict", { cause });
    throw toSdkError(cause);
  }
}

/** Host-only: installed ownership AND live request authority are both required. */
export function createInboxEntityEdits(deps: {
  readonly entities: Pick<
    EntityServiceClient,
    | "getEntityWriteSnapshot"
    | "updateEntity"
    | "deleteEntity"
    | "getEntityTypeConfig"
  >;
  readonly authority: IAuthRegistry;
  readonly caller: InterfaceCaller;
  readonly ownedTypes: ReadonlySet<string>;
  readonly signal?: AbortSignal;
  assertAllowed(
    type: string,
    action: "update" | "publish" | "delete",
    permission: InterfaceCaller["permission"],
  ): void;
}): InboxEntityEdits {
  const { entities, caller, authority, assertAllowed } = deps;
  const owned = new Set(deps.ownedTypes);
  const requestSignal = routeCallerSignal(caller, authority);
  const signal = deps.signal
    ? AbortSignal.any([deps.signal, requestSignal])
    : requestSignal;
  const scope = permissionToVisibilityScope(caller.permission);
  const edits = new WeakMap<object, HeldEdit>();
  const active = (): void => {
    assertRouteCaller(caller, authority);
    if (signal.aborted) throw new SdkError("cancelled");
  };
  const own = (type: string): void => {
    active();
    if (!owned.has(type)) throw new SdkError("permission_denied");
  };
  const held = (type: string, edit: OwnedEntityEdit): HeldEdit => {
    own(type);
    const previous = edits.get(edit);
    if (previous?.entity.entityType !== type)
      throw new SdkError("invalid_input");
    return previous;
  };
  const allow = (
    type: string,
    action: "update" | "publish" | "delete",
  ): void => {
    own(type);
    try {
      assertAllowed(type, action, caller.permission);
    } catch (cause) {
      throw new SdkError("permission_denied", { cause });
    }
  };
  const eventContext = Object.freeze({
    actor: Object.freeze({
      kind: "user" as const,
      userId: caller.actor.id,
      ...(caller.actor.canonicalId === undefined
        ? {}
        : { canonicalId: caller.actor.canonicalId }),
    }),
  });

  return Object.freeze({
    read: (definition, id) =>
      safe(async () => {
        let type: string;
        let key: string;
        try {
          type = name.parse(definition.type);
          key = identifier.parse(id);
        } catch (cause) {
          throw new SdkError("invalid_input", { cause });
        }
        own(type);
        const schema = definitionEntitySchema(definition);
        const snapshot = await entities.getEntityWriteSnapshot({
          entityType: type,
          id: key,
          visibilityScope: scope,
          publishedOnly: caller.permission === "public",
          signal,
        });
        active();
        if (!snapshot) return null;
        const canonical = structuredClone(snapshot);
        if (canonical.entity.entityType !== type || canonical.entity.id !== key)
          throw new SdkError("invalid_response");
        if (
          !getVisibleContentVisibilities(scope).includes(
            canonical.entity.visibility,
          )
        )
          throw new SdkError("permission_denied");
        const view = schema.parse(structuredClone(canonical.entity));
        if (
          view.entityType !== type ||
          view.id !== key ||
          view.visibility !== canonical.entity.visibility
        )
          throw new SdkError("invalid_response");
        const edit = issueOwnedEntityEdit(
          freezeTree(structuredClone(view)),
          canonical.revision,
        );
        edits.set(edit, canonical);
        return edit;
      }),
    replace: (definition, edit, proposal) =>
      safe(async () => {
        const previous = held(definition.type, edit);
        let next: BaseEntity;
        try {
          next = baseEntityParserSchema.parse(structuredClone(proposal));
        } catch (cause) {
          throw new SdkError("invalid_input", { cause });
        }
        if (
          next.id !== previous.entity.id ||
          next.entityType !== previous.entity.entityType ||
          next.visibility !== previous.entity.visibility
        )
          throw new SdkError("invalid_input");
        const result = await entities.updateEntity({
          entity: next,
          options: {
            conditionalWrite: { expectedRevision: previous.revision },
            signal,
            eventContext,
            beforeWrite: async (final) => {
              if (
                final.id !== previous.entity.id ||
                final.entityType !== previous.entity.entityType ||
                final.visibility !== previous.entity.visibility
              )
                throw new SdkError("permission_denied");
              // Check the actual persisted metadata after codec/validation, not the proposal.
              const boundary = getPublishBoundaryState(
                final.entityType,
                previous.entity.metadata["status"],
                final.metadata["status"],
                entities,
              );
              allow(
                final.entityType,
                boundary === "non-publish" ? "update" : "publish",
              );
            },
          },
        });
        if (result.skipped) throw new SdkError("conflict");
      }),
    delete: (definition, edit) =>
      safe(async () => {
        const previous = held(definition.type, edit);
        const deleted = await entities.deleteEntity({
          entityType: previous.entity.entityType,
          id: previous.entity.id,
          options: {
            conditionalWrite: { expectedRevision: previous.revision },
            signal,
            eventContext,
            beforeWrite: async () => {
              allow(previous.entity.entityType, "delete");
            },
          },
        });
        if (!deleted) throw new SdkError("conflict");
      }),
  } satisfies InboxEntityEdits);
}
