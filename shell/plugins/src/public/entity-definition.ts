import type { EntityActionPolicyRule, Template } from "@brains/templates";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import type { AnyDashboardWidgetDefinition } from "../operator/operator-definition-contract";
import type { ProjectionRule } from "../entity/projection-rule";
import type { AnyDataSourceDeclaration } from "./entity-data-source";
import { z } from "@brains/utils/zod";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type {
  AnyEntityDefinition,
  EntityAgentContextProvider,
  EntityAttachmentDeclaration,
  EntityCreateRouting,
  EntityPublishAssetDeclaration,
  EntityFeedDeclaration,
  EntityOf,
  EntityPublishDeclaration,
  EntityDefinition,
  EntityDashboardWidgetContext,
  EntityDashboardWidgetDeclaration,
  EntityEvalDeclaration,
  EntityInsightDeclaration,
  EntityGenerationDeclaration,
  EntityScheduledGenerationDeclaration,
  AnyEntityJobDeclaration,
  EntityDefinitionConfig,
  EntitySeedDefinition,
  EntityMarkdownCodec,
  EntityMetadataSchema,
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
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityMetadataSchema,
  EntityOf,
  EntityVisibility,
  EntitySeedDefinition,
  EntitySeedTrigger,
  EntityWriteInput,
  ProjectionDefinition,
  ProjectionTarget,
} from "../entity/entity-definition-contract";

export function defineEntity<
  const TType extends string,
  TMetadataSchema extends EntityMetadataSchema,
  TInputSchema extends z.ZodType = z.ZodType,
>(definition: {
  readonly type: TType;
  readonly purpose: string;
  readonly metadata: TMetadataSchema;
  readonly metadataFrom?: ((stored: unknown) => unknown) | undefined;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  readonly config?: EntityDefinitionConfig | undefined;
  readonly actions?: EntityActionPolicyRule | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
  readonly templates?: Record<string, Template> | undefined;
  readonly dataSources?: readonly AnyDataSourceDeclaration[] | undefined;
  readonly agentContext?: EntityAgentContextProvider | undefined;
  readonly attachments?: readonly EntityAttachmentDeclaration[] | undefined;
  readonly generation?: EntityGenerationDeclaration<TInputSchema> | undefined;
  readonly stub?:
    | ((input: { readonly id: string; readonly title: string }) => {
        readonly content: string;
        readonly metadata: z.input<TMetadataSchema>;
      })
    | undefined;
  readonly scheduledGeneration?:
    EntityScheduledGenerationDeclaration | undefined;
  readonly projectionRules?:
    | readonly ProjectionRule[]
    | ((context: {
        readonly template: (localName: string) => string;
      }) => readonly ProjectionRule[])
    | undefined;
  readonly atproto?: AtprotoProjection | undefined;
  readonly evals?: EntityEvalDeclaration | undefined;
  readonly insights?: EntityInsightDeclaration | undefined;
  readonly dashboardWidgets?:
    readonly EntityDashboardWidgetDeclaration[] | undefined;
  readonly jobs?: Record<string, AnyEntityJobDeclaration> | undefined;
  readonly instructions?: string | undefined;
  readonly create?: EntityCreateRouting | undefined;
  readonly publish?: EntityPublishDeclaration | undefined;
  readonly publishAssets?: readonly EntityPublishAssetDeclaration[] | undefined;
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
  });
}

/**
 * Pair a dashboard widget with the reader that fills it.
 *
 * The definition's data schema types the reader's return here, at the point
 * it is written; an entity holds its widgets in one type-erased list.
 */
export function defineEntityDashboardWidget<
  TDefinition extends AnyDashboardWidgetDefinition,
>(
  definition: TDefinition,
  load: (
    context: EntityDashboardWidgetContext,
  ) => Promise<z.input<TDefinition["data"]>>,
): EntityDashboardWidgetDeclaration {
  return Object.freeze({ definition, load });
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
}

export function defineEntityPackage<
  const TEntities extends readonly AnyEntityDefinition[],
  const TProjections extends readonly ProjectionDefinition[],
>(definition: {
  readonly id: string;
  readonly entities: TEntities;
  readonly projections: TProjections;
}): EntityPackageDefinition<TEntities, TProjections>;
export function defineEntityPackage<
  const TEntities extends readonly AnyEntityDefinition[],
>(definition: {
  readonly id: string;
  readonly entities: TEntities;
  readonly projections?: undefined;
}): EntityPackageDefinition<TEntities, readonly []>;
export function defineEntityPackage(definition: {
  readonly id: string;
  readonly entities: readonly AnyEntityDefinition[];
  readonly projections?: readonly ProjectionDefinition[] | undefined;
}): EntityPackageDefinition {
  const entities = Object.freeze([...definition.entities]);
  const projections = Object.freeze([...(definition.projections ?? [])]);
  const entitySet = new Set<AnyEntityDefinition>(entities);
  const entityTypes = entities.map(({ type }) => type);
  if (new Set(entityTypes).size !== entityTypes.length) {
    throw new Error(
      `Entity package "${definition.id}" contains duplicate entity types`,
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
  };
  return createPluginPackageDefinition({
    family: "entity",
    id: definition.id,
    config: entityPackageConfig,
    public: publicDefinition,
    instantiate: ({ package: metadata, scope }) =>
      createEntityPackagePlugins(entities, projections, metadata, scope),
  });
}
