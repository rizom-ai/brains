import { SdkError } from "@brains/contracts";
import type {
  BaseEntity,
  IEntityService,
  SearchWithDistancesRequest,
} from "@brains/entity-service";
import type { z } from "@brains/utils/zod";
import type { AIGenerationSchema } from "./ai-types";
import type {
  AnyEntityDefinition,
  DataSourceListOptions,
  EntityOf,
  EntityReader,
} from "./entity-definition-contract";

/**
 * Internal runtime capabilities bound to one entity callback's call, for
 * first-party packages only. A first-party definition reaches them with
 * `entityRuntime(context)` on the context it was handed; the public context
 * types never name them, and a context the runtime did not build has none.
 *
 * Each keeps the call's authority: `nearest` reads at the call's
 * visibility, `packageEntities` reads only the declaring package's own
 * types, at every visibility, and nothing here writes.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-entity-runtime)
 * until each capability is public or no first-party package needs it.
 */
export interface EntityRuntime {
  /**
   * Records of a type nearest a query by embedding distance, closest
   * first, at the call's visibility. Distances are raw cosine distances.
   */
  nearest<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    query: string,
    options?: { maxDistance?: number; limit?: number },
  ): Promise<Array<{ entity: EntityOf<TDefinition>; distance: number }>>;
  /** One structured AI answer to a free-form prompt. */
  generateObject<TSchema extends z.ZodType>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>>;
  /** Reads of the declaring package's own types, at every visibility. */
  readonly packageEntities: EntityReader;
  /**
   * A create route's answer that hands the request to the ordinary create,
   * as an entity plugin's interceptor continued it: unchanged, or with this
   * title and content in place of the request's and its stated fields
   * folded in. The runtime performs it at the caller's authority, choosing
   * the id from the title and making it unique, as the direct create does.
   * Outside the brain's runtime it is a refusal.
   */
  ordinaryCreate(document?: OrdinaryCreateDocument): {
    readonly refuse: string;
  };
  /**
   * Untyped reads of any entity type, at exactly the build's own scope
   * (public, and only published records in a production build), for a data
   * source that reads across types it has no definitions for. Data sources
   * only; it never widens the scope and never writes.
   */
  readonly anyEntities: AnyEntityReads;
}

/** Read-only, untyped reads across entity types. */
export interface AnyEntityReads {
  getEntityTypes(): string[];
  listEntities(request: {
    readonly entityType: string;
    readonly options?:
      | {
          readonly filter?:
            | {
                readonly metadata?:
                  Readonly<Record<string, unknown>> | undefined;
              }
            | undefined;
          readonly limit?: number | undefined;
        }
      | undefined;
  }): Promise<BaseEntity[]>;
  getEntity(request: {
    readonly entityType: string;
    readonly id: string;
  }): Promise<BaseEntity | null>;
}

/** The build-scoped reads a data source's runtime reads through. */
export type AnyEntityService = Pick<
  IEntityService,
  "getEntityTypes" | "listEntities" | "getEntity"
>;

/** What an ordinary create takes in place of the request's own. */
export interface OrdinaryCreateDocument {
  readonly title?: string | undefined;
  readonly content: string;
  readonly fields?: Readonly<Record<string, unknown>> | undefined;
}

/** What binding a call's runtime needs. */
export interface EntityRuntimeBinding {
  /** Reads at the call's visibility. */
  readonly reader: EntityReader;
  /** Reads as the package acting as itself. */
  readonly packageReader: EntityReader;
  readonly ownsType: (entityType: string) => boolean;
  readonly searchWithDistances: (
    request: SearchWithDistancesRequest,
  ) => Promise<
    Array<{ entityId: string; entityType: string; distance: number }>
  >;
  readonly generateObject: <T>(
    prompt: string,
    schema: AIGenerationSchema<T>,
  ) => Promise<{ object: T }>;
}

const entityRuntimeKey = Symbol("rizom.entity-runtime");
const ordinaryCreateKey = Symbol("rizom.ordinary-create");

/**
 * The ordinary create a route answered, when it did: the document it hands
 * on, or `null` for the request as made.
 */
export function ordinaryCreateOf(
  resolution: object,
): { document: OrdinaryCreateDocument | null } | undefined {
  const marked: unknown = Reflect.get(resolution, ordinaryCreateKey);
  if (typeof marked !== "object" || marked === null) return undefined;
  const document: unknown = Reflect.get(marked, "document");
  return { document: isOrdinaryCreateDocument(document) ? document : null };
}

function isOrdinaryCreateDocument(
  value: unknown,
): value is OrdinaryCreateDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "content") === "string"
  );
}

function ownTypesOnly(
  reader: EntityReader,
  ownsType: (entityType: string) => boolean,
): EntityReader {
  const own = (definition: AnyEntityDefinition): void => {
    if (!ownsType(definition.type)) {
      throw new SdkError("permission_denied", {
        message: `Package reads reach only the package's own types, not "${definition.type}"`,
      });
    }
  };
  return Object.freeze({
    get: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> => {
      own(definition);
      return reader.get(definition, id);
    },
    list: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> => {
      own(definition);
      return reader.list(definition, options);
    },
    count: async (definition: AnyEntityDefinition): Promise<number> => {
      own(definition);
      return reader.count(definition);
    },
  });
}

function bindEntityRuntime(binding: EntityRuntimeBinding): EntityRuntime {
  return Object.freeze({
    async nearest<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      query: string,
      options: { maxDistance?: number; limit?: number } = {},
    ): Promise<Array<{ entity: EntityOf<TDefinition>; distance: number }>> {
      const { maxDistance, limit } = options;
      const hits = (
        await binding.searchWithDistances({
          query,
          types: [definition.type],
          ...(maxDistance !== undefined && { maxDistance }),
        })
      )
        .filter(
          (hit) =>
            hit.entityType === definition.type &&
            (maxDistance === undefined || hit.distance <= maxDistance),
        )
        .sort((left, right) => left.distance - right.distance);
      // Read at the call's visibility: a hit the caller may not see is not
      // a hit.
      const read = await Promise.all(
        hits.map(async (hit) => ({
          entity: await binding.reader.get(definition, hit.entityId),
          distance: hit.distance,
        })),
      );
      const visible = read.flatMap(({ entity, distance }) =>
        entity ? [{ entity, distance }] : [],
      );
      return limit === undefined ? visible : visible.slice(0, limit);
    },
    async generateObject<TSchema extends z.ZodType>(
      prompt: string,
      schema: TSchema,
    ): Promise<z.output<TSchema>> {
      const { object } = await binding.generateObject(prompt, schema);
      return schema.parse(object);
    },
    packageEntities: ownTypesOnly(binding.packageReader, binding.ownsType),
    ordinaryCreate(document?: OrdinaryCreateDocument): {
      readonly refuse: string;
    } {
      const resolution = {
        refuse:
          "This create hands on to the ordinary create, which only the brain's runtime performs",
      };
      Object.defineProperty(resolution, ordinaryCreateKey, {
        value: Object.freeze({
          document: document ? Object.freeze({ ...document }) : null,
        }),
        enumerable: false,
      });
      return Object.freeze(resolution);
    },
    anyEntities: unavailableAnyEntities("an entity callback"),
  });
}

/** An untyped read refused where no build scope stands behind it. */
function unavailableAnyEntities(where: string): AnyEntityReads {
  const refuse = (): never => {
    throw new Error(`anyEntities reads only in a data source, not in ${where}`);
  };
  return Object.freeze({
    getEntityTypes: refuse,
    listEntities: refuse,
    getEntity: refuse,
  });
}

/**
 * Untyped reads through the build-scoped entity service a data source is
 * handed. Requests are rebuilt from the fields the view names, so no scope
 * or option a caller passes can widen what the build may read.
 */
function buildScopedAnyEntities(service: AnyEntityService): AnyEntityReads {
  return Object.freeze({
    getEntityTypes: (): string[] => service.getEntityTypes(),
    listEntities: (
      request: Parameters<AnyEntityReads["listEntities"]>[0],
    ): Promise<BaseEntity[]> => {
      const metadata = request.options?.filter?.metadata;
      const limit = request.options?.limit;
      return service.listEntities({
        entityType: request.entityType,
        options: {
          ...(metadata !== undefined && {
            filter: { metadata: { ...metadata } },
          }),
          ...(limit !== undefined && { limit }),
        },
      });
    },
    getEntity: (
      request: Parameters<AnyEntityReads["getEntity"]>[0],
    ): Promise<BaseEntity | null> =>
      service.getEntity({ entityType: request.entityType, id: request.id }),
  });
}

/**
 * A data source's read context with its internal runtime: untyped reads at
 * the build's own scope. A data source neither searches, generates, writes
 * nor creates, so those refuse.
 */
export function withDataSourceRuntime<TContext extends object>(
  context: TContext,
  service: AnyEntityService,
): Readonly<TContext> {
  const refuse = (name: string) => (): never => {
    throw new Error(`${name} is not available to a data source`);
  };
  const runtime: EntityRuntime = Object.freeze({
    nearest: refuse("nearest"),
    generateObject: refuse("generateObject"),
    packageEntities: Object.freeze({
      get: refuse("packageEntities"),
      list: refuse("packageEntities"),
      count: refuse("packageEntities"),
    }),
    ordinaryCreate: refuse("ordinaryCreate"),
    anyEntities: buildScopedAnyEntities(service),
  });
  Object.defineProperty(context, entityRuntimeKey, {
    value: runtime,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(context);
}

/**
 * A callback context the runtime hands a definition, with the call's
 * internal runtime attached under a key no public type names. The context
 * is frozen afterwards, as every callback context is.
 */
export function withEntityRuntime<TContext extends object>(
  context: TContext,
  binding: EntityRuntimeBinding,
): Readonly<TContext> {
  Object.defineProperty(context, entityRuntimeKey, {
    value: bindEntityRuntime(binding),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(context);
}

function isEntityRuntime(value: unknown): value is EntityRuntime {
  return typeof value === "object" && value !== null;
}

/**
 * The internal runtime bound to a callback's call. First-party packages
 * only: a context the brain's runtime did not build, such as a test double,
 * has none, and is refused.
 */
export function entityRuntime(context: object): EntityRuntime {
  const runtime: unknown = Reflect.get(context, entityRuntimeKey);
  if (!isEntityRuntime(runtime)) {
    throw new Error(
      "This context carries no entity runtime: entityRuntime() reaches internal capabilities of a callback context the brain's runtime built, for first-party packages only",
    );
  }
  return runtime;
}
