import type {
  BaseEntity,
  ContentVisibility,
  EntitySchema,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type {
  EntityDefinitionShape,
  EntityOf,
  EntityWriteInput,
} from "./entity-shape";

/** Definition-typed reads shared by authoring callbacks. */
export interface EntityReader {
  get<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  list<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    options?: ListOptions,
  ): Promise<EntityOf<TDefinition>[]>;
  search<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    query: string,
    options?: Omit<SearchOptions, "types" | "excludeTypes">,
  ): Promise<SearchResult<EntityOf<TDefinition>>[]>;

  /** Dynamic-type reads for catalog/routing consumers such as A2A. */
  getEntity(request: {
    entityType: string;
    id: string;
    visibilityScope?: ContentVisibility | undefined;
  }): Promise<BaseEntity | null>;
  getEntity<T extends BaseEntity>(
    request: {
      entityType: string;
      id: string;
      visibilityScope?: ContentVisibility | undefined;
    },
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  listEntities(request: {
    entityType: string;
    options?: ListOptions;
  }): Promise<BaseEntity[]>;
  listEntities<T extends BaseEntity>(
    request: { entityType: string; options?: ListOptions },
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  getEntityTypes(): string[];
  /** Corpus counts used by profile generation and bounded operator lists. */
  getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>>;
  count(request: {
    entityType: string;
    options?: Pick<ListOptions, "publishedOnly" | "filter"> | undefined;
  }): Promise<number>;
}

/** Writes are checked against the declaring service's owned/stewarded types. */
export interface EntityAccess extends EntityReader {
  create<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    input: NoInfer<
      Omit<EntityWriteInput<TDefinition>, "id"> & {
        readonly id?: string;
        readonly created?: string;
        readonly updated?: string;
      }
    >,
  ): Promise<{ id: string }>;
  update<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    entity: NoInfer<EntityOf<TDefinition>>,
  ): Promise<{ id: string }>;
  delete(definition: EntityDefinitionShape, id: string): Promise<boolean>;
  /** Accept a durable placeholder without replacing an existing record. */
  createPending<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    input: NoInfer<EntityWriteInput<TDefinition> & { readonly id: string }>,
  ): Promise<{ id: string; created: boolean }>;
  /** Complete a placeholder, or create the result if no placeholder exists. */
  saveProcessed<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    input: NoInfer<EntityWriteInput<TDefinition> & { readonly id: string }>,
    options?: { readonly expectedContentHash?: string | undefined },
  ): Promise<{ id: string }>;
}
