import type { EntityActionPolicyRule, Template } from "@brains/templates";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import type { AnyDashboardWidgetDefinition } from "../operator/operator-definition-contract";
import type { ProjectionRule } from "../entity/projection-rule";
import type { AnyDataSourceDeclaration } from "./entity-data-source";
import { z } from "@brains/utils/zod";
import { generateMarkdownWithFrontmatter } from "@brains/entity-service";
import { parseMarkdown } from "@brains/utils/markdown";
import { createEntityPackagePlugins } from "../entity/declarative-entity-plugin";
import type {
  AnyEntityDefinition,
  EntityAgentContextProvider,
  EntityAtprotoDiscovery,
  EntityCheckDeclaration,
  EntityInboxDeclaration,
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
  readonly checks?: readonly EntityCheckDeclaration[] | undefined;
  readonly inbox?: EntityInboxDeclaration | undefined;
  readonly atprotoDiscovery?: EntityAtprotoDiscovery | undefined;
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

/**
 * A codec for a type that keeps its frontmatter inside the file as well as
 * in metadata.
 *
 * Most types let the runtime own the frontmatter: the body is the content,
 * metadata is declared alongside, and the two are assembled on write. A type
 * whose files are synced to disk and edited there cannot do that — the header
 * is part of the document a person opens.
 *
 * Which means the record has two copies of the same fields, and metadata is
 * the one a status change reaches. Encoding merges metadata over what the
 * file already carries: fields tracked in both take the metadata value, and
 * fields only the file has — anything added by hand — survive.
 */
export function frontmatterInContent<TMetadata extends Record<string, unknown>>(
  derive: (frontmatter: Readonly<Record<string, unknown>>) => TMetadata,
): {
  decode: (input: {
    readonly content: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
  }) => { readonly content: string; readonly metadata: TMetadata };
  encode: (input: {
    readonly content: string;
    readonly metadata: TMetadata;
  }) => {
    readonly content: string;
    readonly frontmatter: Record<string, unknown>;
  };
} {
  return {
    decode: ({ content, frontmatter }) => ({
      content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
      metadata: derive(frontmatter),
    }),
    encode: ({
      content,
      metadata,
    }): {
      readonly content: string;
      readonly frontmatter: Record<string, unknown>;
    } => {
      const parsed = parseMarkdown(content);
      return {
        content: generateMarkdownWithFrontmatter(parsed.content, {
          ...parsed.frontmatter,
          ...metadata,
        }),
        // Already inside `content`; declaring it again would write it twice.
        frontmatter: {},
      };
    },
  };
}

/**
 * The parse schema a declaration implies.
 *
 * A package that reads its own entities through the schema-bearing reads
 * needs a schema to hand them, and its definition already carries every
 * piece of one. Deriving it here is what keeps a package from maintaining a
 * second, hand-written schema beside the declaration that owns the shape.
 */
export {
  definitionEntitySchema,
  parseDefinitionEntity,
} from "../entity/entity-schema";
