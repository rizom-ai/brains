import {
  entityTypeClassificationSchema,
  type EntityTypeClassification,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type { EntityActionPolicyRuleInput, Template } from "@brains/templates";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDefinition,
  EntityDefinition,
  EntityDefinitionConfig,
  EntityFeedDeclaration,
  EntityMarkdownCodec,
  EntityMetadataSchema,
  EntityOf,
  EntitySeedDefinition,
  ProjectionDefinition,
} from "../entity/entity-definition-contract";
import {
  assertIdentifier as assertLocalId,
  createPluginPackageDefinition,
  type PluginPackageDefinition,
} from "../package-definition";

export type {
  AnyEntityDefinition,
  EncodedEntityMarkdown,
  EntityDefinition,
  EntityDefinitionConfig,
  EntityFeedDeclaration,
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityMetadataSchema,
  EntityOf,
  EntitySeedDefinition,
  EntitySeedTrigger,
  EntityVisibility,
  EntityWriteInput,
  ProjectionDefinition,
  ProjectionTarget,
} from "../entity/entity-definition-contract";

export function defineEntity<
  const TType extends string,
  TMetadataSchema extends EntityMetadataSchema,
>(definition: {
  readonly type: TType;
  readonly purpose: string;
  readonly classification?: EntityTypeClassification;
  readonly metadata: TMetadataSchema;
  readonly metadataFrom?: ((stored: unknown) => unknown) | undefined;
  readonly singleton?: boolean | undefined;
  readonly hasBody?: boolean | undefined;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  readonly displayTitle?: NonNullable<
    EntityDefinition<TType, TMetadataSchema>["displayTitle"]
  >;
  readonly config?: EntityDefinitionConfig | undefined;
  readonly validatePersist?: EntityDefinition<
    TType,
    TMetadataSchema
  >["validatePersist"];
  readonly actions?: EntityActionPolicyRuleInput | undefined;
  readonly coverImage?: boolean | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
  readonly templates?: Readonly<Record<string, Template>> | undefined;
  readonly feed?:
    | EntityFeedDeclaration<EntityOf<EntityDefinition<TType, TMetadataSchema>>>
    | undefined;
}): EntityDefinition<TType, TMetadataSchema> {
  assertLocalId(definition.type, "Entity type");
  if (!definition.purpose.trim()) {
    throw new Error(`Entity "${definition.type}" purpose must not be empty`);
  }
  return Object.freeze({
    kind: "rizom-entity",
    ...definition,
    classification: entityTypeClassificationSchema.parse(
      definition.classification,
    ),
  });
}

export function defineProjection<
  TSource extends AnyEntityDefinition,
  TTarget extends AnyEntityDefinition,
>(
  definition: Omit<ProjectionDefinition<TSource, TTarget>, "kind">,
): ProjectionDefinition<TSource, TTarget> {
  assertLocalId(definition.id, "Projection id");
  return Object.freeze({ kind: "rizom-projection", ...definition });
}

const entityPackageConfig: z.ZodObject<Record<string, never>> = z.object({});

export interface EntityPackageDefinition<
  TEntities extends readonly AnyEntityDefinition[] =
    readonly AnyEntityDefinition[],
  TProjections extends readonly ProjectionDefinition[] =
    readonly ProjectionDefinition[],
> extends PluginPackageDefinition<typeof entityPackageConfig, "entity"> {
  readonly entities: TEntities;
  readonly projections: TProjections;
  readonly dataSources: readonly AnyDataSourceDeclaration[];
}

export function defineEntityPackage<
  const TEntities extends readonly AnyEntityDefinition[],
  const TProjections extends readonly ProjectionDefinition[],
>(definition: {
  readonly id: string;
  readonly entities: TEntities;
  readonly projections: TProjections;
  readonly dataSources?: readonly AnyDataSourceDeclaration[] | undefined;
}): EntityPackageDefinition<TEntities, TProjections>;
export function defineEntityPackage<
  const TEntities extends readonly AnyEntityDefinition[],
>(definition: {
  readonly id: string;
  readonly entities: TEntities;
  readonly projections?: undefined;
  readonly dataSources?: readonly AnyDataSourceDeclaration[] | undefined;
}): EntityPackageDefinition<TEntities, readonly []>;
export function defineEntityPackage(definition: {
  readonly id: string;
  readonly entities: readonly AnyEntityDefinition[];
  readonly projections?: readonly ProjectionDefinition[] | undefined;
  readonly dataSources?: readonly AnyDataSourceDeclaration[] | undefined;
}): EntityPackageDefinition {
  const entities = Object.freeze([...definition.entities]);
  const projections = Object.freeze([...(definition.projections ?? [])]);
  const dataSources = Object.freeze([...(definition.dataSources ?? [])]);
  const entitySet = new Set<AnyEntityDefinition>(entities);
  const entityTypes = entities.map(({ type }) => type);
  if (new Set(entityTypes).size !== entityTypes.length) {
    throw new Error(
      `Entity package "${definition.id}" contains duplicate entity types`,
    );
  }
  // Data source ids are scoped to the package, so one id twice would
  // collide when the second registers.
  const dataSourceIds = dataSources.map(({ id }) => id);
  if (new Set(dataSourceIds).size !== dataSourceIds.length) {
    throw new Error(
      `Entity package "${definition.id}" contains duplicate data source ids`,
    );
  }
  if (dataSources.length > 0 && entities.length === 0) {
    throw new Error(
      `Entity package "${definition.id}" declares data sources but no entities to install them`,
    );
  }
  const strayDataSource = dataSources.find(
    (source) =>
      source.kind === "rizom-entity-data-source" &&
      !entitySet.has(source.entity),
  );
  if (strayDataSource) {
    throw new Error(
      `Entity package "${definition.id}" data source "${strayDataSource.id}" reads an entity outside its package`,
    );
  }
  const projectionIds = projections.map(({ id }) => id);
  if (new Set(projectionIds).size !== projectionIds.length) {
    throw new Error(
      `Entity package "${definition.id}" contains duplicate projection ids`,
    );
  }
  const invalidProjection = projections.find(
    ({ source, target }) => !entitySet.has(source) || !entitySet.has(target),
  );
  if (invalidProjection) {
    throw new Error(
      `Entity package "${definition.id}" projection "${invalidProjection.id}" references an entity outside its package`,
    );
  }

  const publicDefinition = {
    entities,
    projections,
    dataSources,
  };
  return createPluginPackageDefinition({
    family: "entity",
    id: definition.id,
    config: entityPackageConfig,
    public: publicDefinition,
    instantiate: ({ package: metadata, scope }) =>
      createEntityPackagePlugins(
        entities,
        projections,
        metadata,
        scope,
        dataSources,
      ),
  });
}
