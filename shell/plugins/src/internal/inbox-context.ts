import { SdkError } from "@brains/contracts";
import {
  permissionToVisibilityScope,
  scopeEntityReads,
  type EntityServiceClient,
} from "@brains/entity-service";
import type { EntityReader } from "../entity/entity-access-contract";
import type {
  EntityInboxContext,
  EntityInboxDetailContext,
  EntityInboxListContext,
  EntityReactionContext,
} from "../entity/entity-definition-contract";
import type { InterfaceCaller } from "../interface/route-contract";
import type { IAuthRegistry } from "../contracts/auth-registry";
import { createJobEntityAccess } from "../job/job-entity-access";
import { createAuthoringEntityReader } from "./authoring-entity-access";
import { assertRouteCaller, routeCallerSignal } from "./route-caller-authority";
import { createInboxEntityEdits } from "./inbox-entity-edits";

function readerView(reader: EntityReader, active: () => void): EntityReader {
  function guard<T extends (...args: never[]) => unknown>(
    fn: T,
    asynchronous = true,
  ): T {
    return new Proxy(fn, {
      apply(target, receiver, args): unknown {
        if (asynchronous)
          return (async (): Promise<unknown> => {
            active();
            const result: unknown = await Reflect.apply(target, receiver, args);
            active();
            return result;
          })();
        active();
        const result: unknown = Reflect.apply(target, receiver, args);
        active();
        return result;
      },
    });
  }
  return Object.freeze({
    get: guard(reader.get),
    list: guard(reader.list),
    search: guard(reader.search),
    getEntity: guard(reader.getEntity),
    listEntities: guard(reader.listEntities),
    getEntityTypes: guard(reader.getEntityTypes, false),
    getSourcePolicy: guard(reader.getSourcePolicy, false),
    getEntityCounts: guard(reader.getEntityCounts),
    count: guard(reader.count),
  });
}

/** System projection only: no retained background CRUD or auth management. */
export function createInboxListContext(
  reaction: EntityReactionContext,
): EntityInboxListContext {
  return Object.freeze({
    entities: readerView(reaction.entities, () => {}),
    messaging: reaction.messaging,
    state: reaction.state,
    permissions: reaction.permissions,
    domain: reaction.domain,
    siteUrl: reaction.siteUrl,
    logger: reaction.logger,
  });
}

interface InboxContextInput {
  readonly reaction: EntityReactionContext;
  readonly entities: EntityServiceClient;
  readonly authority: IAuthRegistry;
  readonly ownedTypes: ReadonlySet<string>;
  readonly caller: InterfaceCaller;
  readonly signal?: AbortSignal;
}

export function createInboxDetailContext(
  input: InboxContextInput,
): EntityInboxDetailContext {
  const { reaction, entities, authority, ownedTypes, caller } = input;
  const lifetime = routeCallerSignal(caller, authority);
  const signal = input.signal
    ? AbortSignal.any([lifetime, input.signal])
    : lifetime;
  const scope = permissionToVisibilityScope(caller.permission);
  const active = (): void => {
    assertRouteCaller(caller, authority);
    if (signal.aborted) throw new SdkError("cancelled");
  };
  active();
  const native = createJobEntityAccess(
    scopeEntityReads(entities, {
      visibilityScope: scope,
      publishedOnly: caller.permission === "public",
    }),
    ownedTypes,
    "Inbox",
    scope,
  );
  return Object.freeze({
    ...createInboxListContext(reaction),
    signal,
    entities: readerView(createAuthoringEntityReader(native), active),
  });
}

export function createInboxContext(
  input: InboxContextInput,
): EntityInboxContext {
  const detail = createInboxDetailContext(input);
  return Object.freeze({
    ...detail,
    edits: createInboxEntityEdits({
      entities: input.entities,
      authority: input.authority,
      caller: input.caller,
      ownedTypes: input.ownedTypes,
      signal: detail.signal,
      assertAllowed: (type, action, permission) =>
        input.reaction.permissions.assertEntityActionAllowed(type, action, {
          userPermissionLevel: permission,
        }),
    }),
  });
}
