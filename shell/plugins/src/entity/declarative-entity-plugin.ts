import {
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
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

const entitySchemaCache = new WeakMap<
  AnyEntityDefinition,
  z.ZodType<EntityOf<AnyEntityDefinition>, unknown>
>();

function entitySchema(
  definition: AnyEntityDefinition,
): z.ZodType<EntityOf<AnyEntityDefinition>, unknown> {
  let schema = entitySchemaCache.get(definition);
  if (!schema) {
    schema = baseEntitySchema.extend({
      entityType: z.literal(definition.type),
      metadata: definition.metadata,
    });
    entitySchemaCache.set(definition, schema);
  }
  return schema;
}

export function parseDefinitionEntity<TDefinition extends AnyEntityDefinition>(
  definition: TDefinition,
  input: unknown,
): EntityOf<TDefinition> {
  return entitySchema(definition).parse(input) as EntityOf<TDefinition>;
}

function encodeParts(
  definition: AnyEntityDefinition,
  input: {
    readonly content: string;
    readonly metadata: Record<string, unknown>;
  },
): { readonly content: string; readonly frontmatter: Record<string, unknown> } {
  return definition.markdown
    ? definition.markdown.encode({
        content: input.content,
        metadata: definition.metadata.parse(input.metadata),
      })
    : { content: input.content, frontmatter: input.metadata };
}

function encodeEntityMarkdown(
  definition: AnyEntityDefinition,
  input: {
    readonly content: string;
    readonly metadata: Record<string, unknown>;
  },
): string {
  const encoded = encodeParts(definition, input);
  return generateMarkdownWithFrontmatter(encoded.content, encoded.frontmatter);
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
      return encodeEntityMarkdown(definition, entity);
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
      return generateFrontmatter(encodeParts(definition, entity).frontmatter);
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
        const metadata = ProjectionJsonObjectSchema.parse(
          projection.target.metadata.parse(entity.metadata),
        );
        const visibility = entity.visibility ?? "public";
        intents.push({
          operation: "upsert",
          entity: {
            id: entity.id,
            entityType: projection.target.type,
            content: applyVisibilityToMarkdown(
              encodeEntityMarkdown(projection.target, {
                content: entity.content,
                metadata,
              }),
              visibility,
            ),
            metadata,
            visibility,
          },
        });
      },
    },
  });
  return intents;
}

function projectionRule(
  projection: ProjectionDefinition,
  version: string,
  scope: (localId: string) => string,
): ProjectionRule {
  return defineProjectionRule({
    id: scope(projection.id),
    version,
    sources: [{ kind: "entity", types: [projection.source.type] }],
    targetType: projection.target.type,
    inputSchema: ProjectionJsonObjectSchema,
    async selectInput(trigger, context) {
      const selected = trigger.inputs.filter(
        ({ sourceType }) => sourceType === projection.source.type,
      );
      const items = await Promise.all(
        selected.map(async (input): Promise<unknown> => {
          if (input.operation === "delete") {
            return { operation: "delete", id: input.sourceId };
          }
          const source = await context.entities.getEntity({
            entityType: input.sourceType,
            id: input.sourceId,
            visibilityScope: "restricted",
          });
          if (!source) {
            throw new Error(
              `Projection "${projection.id}" could not load ${input.sourceType}:${input.sourceId}`,
            );
          }
          return { operation: "upsert", id: input.sourceId, source };
        }),
      );
      // One recursive validation of the whole envelope; per-item sources are
      // covered by this pass, so they are not parsed individually above.
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
        if (!item.source) {
          throw new Error(
            `Projection "${projection.id}" upsert item ${item.id} is missing its source`,
          );
        }
        intents.push(
          ...(await deriveProjectionUpserts(projection, item.source, signal)),
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
  private readonly projections: readonly ProjectionDefinition[];
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
    this.projections = projections;
    this.scope = scope;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
  }

  protected override getProjectionRules(): ProjectionRule[] {
    return this.projections.map((projection) =>
      projectionRule(projection, this.version, this.scope),
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
      new DeclarativeEntityPlugin(
        definition,
        projections.filter(({ source }) => source === definition),
        metadata,
        scope,
      ),
  );
}
