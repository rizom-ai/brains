import type {
  BaseEntity,
  EntityInput,
  EntityMutationResult,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "@brains/entity-service";
import type { LoggerContract } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import type { IEntityAINamespace } from "../entity/ai-types";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "../entity/entity-definition-contract";
import type { EntityConversationReader } from "../entity/entity-definition-contract";

/**
 * Entity access for a job handler: unrestricted reads, ownership-scoped
 * writes.
 *
 * Reads span types because useful work usually reads across them — a series
 * description is derived from the entities it indexes. Writes are limited to
 * the types the declaring package owns, and the runtime checks
 * `entity.entityType` against that set rather than trusting the caller.
 *
 * Writes take the entity rather than a definition object deliberately: the
 * common case is an entity's own job writing its own type, and passing the
 * definition there would mean the handler importing the definition that
 * declares it — a cycle.
 */
export interface JobEntityAccess {
  listEntities<T extends BaseEntity>(request: {
    entityType: string;
    options?: ListOptions;
  }): Promise<T[]>;
  getEntity<T extends BaseEntity>(request: {
    entityType: string;
    id: string;
  }): Promise<T | null>;
  getEntityTypes(): string[];
  search<T extends BaseEntity = BaseEntity>(request: {
    query: string;
    options?: SearchOptions;
  }): Promise<SearchResult<T>[]>;
  /**
   * Typed read: the entity comes back parsed to the definition's own shape,
   * rather than as a `BaseEntity` the caller has to narrow itself.
   */
  get<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  create<T extends BaseEntity>(
    entity: EntityInput<T>,
  ): Promise<EntityMutationResult>;
  update<T extends BaseEntity>(entity: T): Promise<EntityMutationResult>;
}

export interface JobMessagePublisher {
  publish(input: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

export interface JobTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

/**
 * What every job handler receives, whether it was declared by an entity or
 * by a service package.
 *
 * There is one context because the two used to be complementary halves —
 * entity jobs could reach ai and write entities but never saw config;
 * service jobs saw config but had neither. Any package doing real work
 * needs the union, so there is no longer a split to choose between.
 *
 * Config is deliberately absent: a service declares jobs as a function of
 * config, so a handler closes over exactly the settings it needs.
 */
export interface JobHandlerContext<TInput> {
  readonly input: TInput;
  readonly entities: JobEntityAccess;
  readonly ai: IEntityAINamespace;
  readonly logger: LoggerContract;
  readonly conversations: EntityConversationReader;
  readonly messaging: JobMessagePublisher;
  readonly progress: ProgressContract;
  readonly signal: AbortSignal;
  /**
   * Absent for jobs declared by an entity: the entity plugin context
   * deliberately excludes template rendering, so there is nothing honest to
   * put here. Service-declared jobs always have it.
   */
  readonly templates?: JobTemplateFormatter | undefined;
}
