import type {
  AnyEntityDefinition,
  EntityMetadataInput,
  EntityOf,
  EntityVisibility,
} from "./entity-definition-contract";

/**
 * Writes to the entity types a service's header `entities` declares, as the
 * current caller: the tool caller inside a tool, the requester inside a
 * running job, the operator inside a workspace action, and the package's own
 * grant anywhere else. A write is held to the type's action policy at that
 * permission level; `update` and `delete` refuse a record that changed
 * after it was read, or that the caller cannot see.
 */
export interface OwnedEntityWriter<TOwned extends AnyEntityDefinition> {
  /** Creates a record; one with that id at any visibility is refused. */
  create<TDefinition extends TOwned>(
    definition: TDefinition,
    input: NoInfer<{
      /** Omitted, the runtime picks one. */
      readonly id?: string | undefined;
      readonly content: string;
      readonly metadata: EntityMetadataInput<TDefinition["metadata"]>;
      readonly visibility?: EntityVisibility | undefined;
    }>,
  ): Promise<{ readonly id: string }>;
  /** Changes the content, the metadata or both of a record as it was read. */
  update<TDefinition extends TOwned>(
    definition: TDefinition,
    record: NoInfer<EntityOf<TDefinition>>,
    change: NoInfer<{
      readonly content?: string | undefined;
      readonly metadata?:
        EntityMetadataInput<TDefinition["metadata"]> | undefined;
    }>,
  ): Promise<void>;
  /** Deletes a record as it was read. */
  delete<TDefinition extends TOwned>(
    definition: TDefinition,
    record: NoInfer<EntityOf<TDefinition>>,
  ): Promise<void>;
}
