import {
  ProjectionJsonObjectSchema,
  baseEntitySchema,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type EntityAdapter,
  type ProjectionJsonObject,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import { defineProjectionRule, type ProjectionRule } from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import type {
  AnyEntityDefinition,
  EntityOf,
  ProjectionDefinition,
} from "../public/entity-definition";

interface ProjectionEnvelopeItem {
  readonly operation: "upsert" | "delete";
  readonly id: string;
  readonly source?: ProjectionJsonObject | undefined;
}

const rawFrontmatterSchema = z.record(z.string(), z.unknown());

const projectionEnvelopeSchema = z.object({
  items: z.array(
    z.object({
      operation: z.enum(["upsert", "delete"]),
      id: z.string(),
      source: ProjectionJsonObjectSchema.optional(),
    }),
  ),
});

function entitySchema(
  definition: AnyEntityDefinition,
): z.ZodType<EntityOf<AnyEntityDefinition>, unknown> {
  return baseEntitySchema.extend({
    entityType: z.literal(definition.type),
    metadata: definition.metadata,
  });
}

function entityAdapter(
  definition: AnyEntityDefinition,
): EntityAdapter<EntityOf<AnyEntityDefinition>, Record<string, unknown>> {
  const schema = entitySchema(definition);
  return {
    entityType: definition.type,
    purpose: definition.purpose,
    schema,
    frontmatterSchema: definition.metadata,
    toMarkdown(entity): string {
      const encoded = definition.markdown
        ? definition.markdown.encode({
            content: entity.content,
            metadata: entity.metadata,
          })
        : { content: entity.content, frontmatter: entity.metadata };
      return generateMarkdownWithFrontmatter(
        encoded.content,
        encoded.frontmatter,
      );
    },
    fromMarkdown(markdown): Partial<EntityOf<AnyEntityDefinition>> {
      const parsed = parseMarkdownWithFrontmatter(
        markdown,
        rawFrontmatterSchema,
      );
      const decoded = definition.markdown
        ? definition.markdown.decode({
            content: parsed.content,
            frontmatter: parsed.metadata,
          })
        : { content: parsed.content, metadata: parsed.metadata };
      return {
        content: decoded.content,
        metadata: definition.metadata.parse(decoded.metadata),
      };
    },
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (markdown, schemaToParse) =>
      parseMarkdownWithFrontmatter(markdown, schemaToParse).metadata,
    generateFrontMatter(entity): string {
      const frontmatter = definition.markdown
        ? definition.markdown.encode({
            content: entity.content,
            metadata: entity.metadata,
          }).frontmatter
        : entity.metadata;
      return generateFrontmatter(frontmatter);
    },
    getBodyTemplate: () => "",
  };
}

export async function deriveProjectionUpserts(
  projection: ProjectionDefinition,
  rawSource: ProjectionJsonObject,
  signal: AbortSignal,
): Promise<ProjectionWriteIntent[]> {
  const source = entitySchema(projection.source).parse(rawSource);
  const intents: ProjectionWriteIntent[] = [];
  await projection.project({
    source,
    signal,
    target: {
      async upsert(entity): Promise<void> {
        intents.push({
          operation: "upsert",
          entity: {
            id: entity.id,
            entityType: projection.target.type,
            content: entity.content,
            metadata: ProjectionJsonObjectSchema.parse(
              projection.target.metadata.parse(entity.metadata),
            ),
            visibility: entity.visibility ?? "public",
          },
        });
      },
    },
  });
  return intents;
}

function projectionRule(
  projection: ProjectionDefinition,
  metadata: InstalledPluginPackageMetadata,
  scope: (localId: string) => string,
): ProjectionRule {
  return defineProjectionRule({
    id: scope(projection.id),
    version: metadata.version,
    sources: [{ kind: "entity", types: [projection.source.type] }],
    targetType: projection.target.type,
    inputSchema: ProjectionJsonObjectSchema,
    async selectInput(trigger, context) {
      const selected = trigger.inputs.filter(
        ({ sourceType }) => sourceType === projection.source.type,
      );
      const items = await Promise.all(
        selected.map(async (input): Promise<ProjectionEnvelopeItem> => {
          if (input.operation === "delete") {
            return { operation: "delete", id: input.sourceId };
          }
          const source = await context.entities.getEntity({
            entityType: input.sourceType,
            id: input.sourceId,
          });
          if (!source) {
            throw new Error(
              `Projection "${projection.id}" could not load ${input.sourceType}:${input.sourceId}`,
            );
          }
          return {
            operation: "upsert",
            id: input.sourceId,
            source: ProjectionJsonObjectSchema.parse(source),
          };
        }),
      );
      return ProjectionJsonObjectSchema.parse({ items });
    },
    async derive(input, _context, signal) {
      const envelope = projectionEnvelopeSchema.parse(input);
      const intents: ProjectionWriteIntent[] = [];
      for (const item of envelope.items) {
        signal.throwIfAborted();
        if (item.operation === "delete") {
          intents.push({
            operation: "delete",
            entityType: projection.target.type,
            id: item.id,
          });
          continue;
        }
        intents.push(
          ...(await deriveProjectionUpserts(
            projection,
            ProjectionJsonObjectSchema.parse(item.source),
            signal,
          )),
        );
      }
      return intents;
    },
  });
}

class DeclarativeEntityPlugin extends EntityPlugin<
  EntityOf<AnyEntityDefinition>,
  Record<string, never>,
  Record<string, never>
> {
  private readonly definition: AnyEntityDefinition;
  private readonly projections: readonly ProjectionDefinition[];
  private readonly metadata: InstalledPluginPackageMetadata;
  private readonly scope: (localId: string) => string;
  public readonly entityType: string;
  public readonly schema: z.ZodType<EntityOf<AnyEntityDefinition>, unknown>;
  public readonly adapter: EntityAdapter<
    EntityOf<AnyEntityDefinition>,
    Record<string, unknown>
  >;

  constructor(
    definition: AnyEntityDefinition,
    projections: readonly ProjectionDefinition[],
    metadata: InstalledPluginPackageMetadata,
    scope: (localId: string) => string,
  ) {
    super(scope(definition.type), metadata, {}, emptyEntityPluginConfigSchema);
    this.definition = definition;
    this.projections = projections;
    this.metadata = metadata;
    this.scope = scope;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
  }

  protected override getProjectionRules(): ProjectionRule[] {
    return this.projections
      .filter(({ source }) => source === this.definition)
      .map((projection) =>
        projectionRule(projection, this.metadata, this.scope),
      );
  }
}

export function createEntityPackagePlugins(
  entities: readonly AnyEntityDefinition[],
  projections: readonly ProjectionDefinition[],
  metadata: InstalledPluginPackageMetadata,
  scope: (localId: string) => string,
): DeclarativeEntityPlugin[] {
  return entities.map(
    (definition) =>
      new DeclarativeEntityPlugin(definition, projections, metadata, scope),
  );
}
