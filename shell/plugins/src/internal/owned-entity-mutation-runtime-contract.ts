import type {
  BaseEntity,
  ContentVisibility,
  EntitySchema,
} from "@brains/entity-service";
import type {
  OwnedEntityEdit,
  OwnedEntityOperation,
} from "../entity/owned-entity-mutations";

/** Host-only adapter underneath definition-typed author operations. */
export interface OwnedEntityMutationRuntime {
  read<T extends BaseEntity>(
    request: {
      readonly entityType: string;
      readonly id: string;
      readonly visibilityScope?: ContentVisibility | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<OwnedEntityEdit<T> | null>;
  replace<T extends BaseEntity>(
    edit: OwnedEntityEdit<T>,
    entity: NoInfer<T>,
  ): Promise<void>;
  fold<T extends BaseEntity>(
    source: OwnedEntityEdit<T>,
    target: OwnedEntityEdit<T>,
    entity: NoInfer<T>,
  ): Promise<void>;
  once(
    entityType: string,
    operation: string,
    key: string,
  ): OwnedEntityOperation;
}
