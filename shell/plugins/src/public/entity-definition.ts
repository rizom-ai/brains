import {
  entityTypeClassificationSchema,
  type EntityTypeClassification,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type { EntityActionPolicyRuleInput, Template } from "@brains/templates";
import { entityScheduledGenerationSchema } from "../entity/entity-definition-config";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDefinition,
  EntityAgentContextProvider,
  EntityAnalyticsReportDeclaration,
  EntityCheckDeclaration,
  EntityEvalDeclaration,
  EntityScheduledGenerationDeclaration,
  AnyEntityJobDeclaration,
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationResult,
  EntityJobContext,
  EntityJobDeclaration,
  EntityAttachmentDeclaration,
  EntityCreateRouting,
  EntityDefinition,
  EntityDefinitionConfig,
  EntityFeedDeclaration,
  EntityMarkdownCodec,
  EntityMetadataSchema,
  EntityOf,
  EntityPublishAssetDeclaration,
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
  EntityDashboardBindingContext,
  EntityDashboardWidget,
  EntityInboxActionContext,
  EntityInboxChange,
  EntityInboxDeclaration,
  EntityInboxDetailContext,
  EntityInboxEdits,
  EntityInboxListContext,
  EntityRecordReader,
  EntityCheckAlert,
  EntityCheckCadence,
  EntityCheckContext,
  EntityCheckDeclaration,
  EntityCheckResult,
  EntityAnalyticsReportContext,
  EntityAnalyticsReportDeclaration,
  EntityAtprotoProjection,
  EntityAtprotoPublishConfig,
  EntityAtprotoRecordInput,
  EntityAgentContextProvider,
  EntityEvalContext,
  EntityEvalDeclaration,
  EntityEvalFixtures,
  EntityScheduledGenerationDeclaration,
  AnyEntityJobDeclaration,
  EntityCreateAllocation,
  EntityCreateDelegation,
  EntityGenerationAI,
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationLink,
  EntityGenerationRequest,
  EntityGenerationResult,
  EntityJobContext,
  EntityJobDeclaration,
  EntityJobMessaging,
  EntityJobProgress,
  EntityAttachmentDeclaration,
  EntityCreateAttachment,
  EntityCreateCheck,
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityCreateUploadReader,
  MediaAttachmentContext,
  MediaEntityListRequest,
  MediaEntityReads,
  MediaEntityRequest,
  EncodedEntityMarkdown,
  EntityDefinition,
  EntityDefinitionConfig,
  EntityFeedDeclaration,
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityMetadataSchema,
  EntityOf,
  EntityPublishAssetDeclaration,
  EntityPublishDeclaration,
  EntitySeedDefinition,
  EntitySeedTrigger,
  EntityVisibility,
  EntityWriteInput,
  ProjectionDefinition,
  ProjectionTarget,
} from "../entity/entity-definition-contract";

export function defineEntity<
  const TType extends string,
  // `const` keeps a literal written inline as metadata a literal; see
  // EntityMetadataInput.
  const TMetadataSchema extends EntityMetadataSchema,
  TGenerationInput extends z.ZodType = z.ZodType,
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
  readonly create?: EntityCreateRouting<TMetadataSchema> | undefined;
  readonly attachments?: readonly EntityAttachmentDeclaration[] | undefined;
  readonly jobs?: Readonly<Record<string, AnyEntityJobDeclaration>> | undefined;
  readonly generation?:
    EntityGenerationDeclaration<TGenerationInput, TMetadataSchema> | undefined;
  readonly stub?: EntityDefinition<TType, TMetadataSchema>["stub"];
  readonly scheduledGeneration?:
    EntityScheduledGenerationDeclaration | undefined;
  readonly instructions?: string | undefined;
  readonly agentContext?: EntityAgentContextProvider | undefined;
  readonly evals?: EntityEvalDeclaration | undefined;
  readonly feed?:
    | EntityFeedDeclaration<EntityOf<EntityDefinition<TType, TMetadataSchema>>>
    | undefined;
  readonly projectionRules?: EntityDefinition<
    TType,
    TMetadataSchema
  >["projectionRules"];
  readonly atproto?: EntityDefinition<TType, TMetadataSchema>["atproto"];
  readonly publish?: EntityDefinition<TType, TMetadataSchema>["publish"];
  readonly analyticsReports?:
    readonly EntityAnalyticsReportDeclaration[] | undefined;
  readonly checks?: readonly EntityCheckDeclaration[] | undefined;
  readonly inbox?: EntityDefinition<TType, TMetadataSchema>["inbox"];
  readonly dashboardWidgets?: EntityDefinition<
    TType,
    TMetadataSchema
  >["dashboardWidgets"];
  readonly publishAssets?: readonly EntityPublishAssetDeclaration[] | undefined;
}): EntityDefinition<TType, TMetadataSchema> {
  assertLocalId(definition.type, "Entity type");
  if (definition.scheduledGeneration) {
    if (!definition.generation) {
      throw new Error(
        `Entity "${definition.type}" declares a scheduled generation but no generation`,
      );
    }
    entityScheduledGenerationSchema.parse(definition.scheduledGeneration);
  }
  // Local names: the runtime scopes each job to the declaring type.
  Object.keys(definition.jobs ?? {}).forEach((name) =>
    assertLocalId(name, "Job name"),
  );
  if (!definition.purpose.trim()) {
    throw new Error(`Entity "${definition.type}" purpose must not be empty`);
  }
  assertPublishAssets(definition);
  // Local ids: the runtime scopes each check to the declaring plugin, and
  // two checks of one type would claim one schedule.
  const checkIds = (definition.checks ?? []).map(({ id }) => id);
  checkIds.forEach((id, index) => {
    assertLocalId(id, "Check id");
    if (checkIds.indexOf(id) !== index) {
      throw new Error(
        `Entity "${definition.type}" declares check "${id}" twice`,
      );
    }
  });
  return Object.freeze({
    kind: "rizom-entity",
    ...definition,
    classification: entityTypeClassificationSchema.parse(
      definition.classification,
    ),
  });
}

// An asset renders from an attachment the type provides, and a cover is
// only recorded on a type that carries one: either mistake would queue
// renders that can never land.
function assertPublishAssets(definition: {
  readonly type: string;
  readonly coverImage?: boolean | undefined;
  readonly attachments?: readonly EntityAttachmentDeclaration[] | undefined;
  readonly publishAssets?: readonly EntityPublishAssetDeclaration[] | undefined;
}): void {
  const attached = new Set(definition.attachments?.map(({ type }) => type));
  for (const asset of definition.publishAssets ?? []) {
    if (!attached.has(asset.attachmentType)) {
      throw new Error(
        `Entity "${definition.type}" publish asset renders from "${asset.attachmentType}", which ${definition.type} does not attach`,
      );
    }
    if (asset.field === "coverImageId" && definition.coverImage !== true) {
      throw new Error(
        `Entity "${definition.type}": ${definition.type} records a cover image but does not declare coverImage`,
      );
    }
  }
}

/**
 * Declare a `system_analytics` report for an entity's `analyticsReports`.
 * Its params type the report it runs.
 */
export function defineEntityAnalyticsReport<TParams extends z.ZodObject>(
  declaration: Omit<EntityAnalyticsReportDeclaration<TParams>, "kind">,
): EntityAnalyticsReportDeclaration<TParams> {
  assertLocalId(declaration.type, "Analytics report type");
  if (!declaration.description.trim()) {
    throw new Error(
      `Analytics report "${declaration.type}" description must not be empty`,
    );
  }
  return Object.freeze({ kind: "rizom-analytics-report", ...declaration });
}

/**
 * Declare a durable job for an entity's `jobs`. A job either `handle`s its
 * own work and returns a result, or `generate`s an entity of the declaring
 * type and hands the runtime its lifecycle.
 */
export function defineEntityJob<TInputSchema extends z.ZodType>(declaration: {
  readonly input: TInputSchema;
  handle(context: EntityJobContext<z.output<TInputSchema>>): Promise<unknown>;
}): EntityJobDeclaration<TInputSchema>;
export function defineEntityJob<TInputSchema extends z.ZodType>(declaration: {
  readonly input: TInputSchema;
  generate(
    context: EntityGenerationContext<z.output<TInputSchema>>,
  ): Promise<EntityGenerationResult>;
}): EntityGenerationDeclaration<TInputSchema>;
export function defineEntityJob(
  declaration: EntityJobDeclaration | EntityGenerationDeclaration,
): AnyEntityJobDeclaration {
  // The forms are exclusive in the types; an untyped caller can still send
  // both, and a job that silently took one would drop the other.
  if (
    Object.hasOwn(declaration, "handle") ===
    Object.hasOwn(declaration, "generate")
  ) {
    throw new Error(
      "An entity job either handles or generates — not both or neither",
    );
  }
  return Object.freeze({ ...declaration });
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
