import { SdkError } from "@brains/contracts";
import type { SearchWithDistancesRequest } from "@brains/entity-service";
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
  });
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
