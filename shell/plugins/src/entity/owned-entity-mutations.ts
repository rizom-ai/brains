import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
} from "@brains/entity-service";
import type {
  EntityDefinitionShape,
  EntityOf as EntityFromDefinition,
} from "./entity-shape";

const editBrand: unique symbol = Symbol("owned-entity-edit");

/** An owned, schema-parsed editing view. The host retains the actual CAS condition.
 * Copying or constructing this object does not issue a usable edit credential.
 */
export interface OwnedEntityEdit<T extends BaseEntity = BaseEntity> {
  readonly [editBrand]: true;
  readonly entity: Readonly<T>;
  /** Comparable state identity, not a caller-selected write condition. */
  readonly version: string;
}

/** Runtime-only constructor; authority additionally requires the issuing runtime's WeakMap entry. */
export function issueOwnedEntityEdit<T extends BaseEntity>(
  entity: T,
  version: string,
): OwnedEntityEdit<T> {
  const edit: OwnedEntityEdit<T> = { [editBrand]: true, entity, version };
  return Object.freeze(edit);
}

export type OwnedMutationReceipt =
  | { readonly operation: "none" }
  | { readonly operation: "create" | "update"; readonly entityId: string };

export interface OwnedEntityOperation<T extends BaseEntity = BaseEntity> {
  get(): Promise<OwnedMutationReceipt | null>;
  /** One terminal decision, including no-write, wins for this identity. */
  complete(
    proposal:
      | { readonly operation: "none" }
      | {
          readonly operation: "create";
          readonly entity: EntityInput<T>;
        }
      | {
          readonly operation: "update";
          readonly edit: OwnedEntityEdit<T>;
          readonly entity: T;
        },
  ): Promise<OwnedMutationReceipt>;
}

/** Owned background work only; no registry, raw snapshots or author-selected native namespaces.
 * Named consumer: FAQ capture/reconciliation. Receipts survive target deletion.
 */
export interface OwnedEntityMutations {
  read<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    id: string,
    options?: { readonly visibilityScope?: ContentVisibility },
  ): Promise<OwnedEntityEdit<EntityFromDefinition<TDefinition>> | null>;
  replace<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    edit: OwnedEntityEdit<NoInfer<EntityFromDefinition<TDefinition>>>,
    entity: NoInfer<EntityFromDefinition<TDefinition>>,
  ): Promise<void>;
  /** Remove only the exact state represented by this host-issued edit; conflicts are not deletions.
   * Owned background work only. Named consumer: ranked Topics maintenance. */
  remove<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    edit: OwnedEntityEdit<NoInfer<EntityFromDefinition<TDefinition>>>,
  ): Promise<void>;
  /** Same-type, same-visibility pair; both issued versions must still match. */
  fold<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    source: OwnedEntityEdit<NoInfer<EntityFromDefinition<TDefinition>>>,
    target: OwnedEntityEdit<NoInfer<EntityFromDefinition<TDefinition>>>,
    entity: NoInfer<EntityFromDefinition<TDefinition>>,
  ): Promise<void>;
  /** Local operation name and key, scoped by installed package, declaration AND entity type. */
  once<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    operation: string,
    key: string,
  ): OwnedEntityOperation<EntityFromDefinition<TDefinition>>;
}
