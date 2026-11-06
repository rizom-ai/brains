import {
  EntityWriteConflictError,
  internalFullScope,
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
  baseEntitySchema,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type EntityAdapter,
  type EntityTypeConfig,
  type ProjectionJsonObject,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import { entityActionPolicyRuleSchema } from "@brains/templates";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import type { EntityPluginContext } from "./context";
import { entityTypeConfigFor } from "./entity-definition-config";
import { defineProjectionRule, type ProjectionRule } from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import { SYSTEM_CHANNELS } from "../system-channels";
import type {
  AnyEntityDefinition,
  EntityOf,
  EntitySeedDefinition,
  EntitySeedTrigger,
  ProjectionDefinition,
} from "./entity-definition-contract";

/**
 * Named seed triggers map to internal channels here, so the public surface
 * never names a channel.
 */
const SEED_TRIGGER_CHANNELS: Record<EntitySeedTrigger, string> = {
  "startup-content-settled": SYSTEM_CHANNELS.startupContentSettled,
};

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

/** Stored metadata in its current shape, migrated when the type says how. */
function currentMetadata(
  definition: AnyEntityDefinition,
  stored: unknown,
): unknown {
  return definition.metadataFrom ? definition.metadataFrom(stored) : stored;
}

/** A singleton's only record id is its entity type. */
function recordIdSchema(definition: AnyEntityDefinition): z.ZodString {
  return definition.singleton === true
    ? z.string().refine((id) => id === definition.type, {
        message: `A ${definition.type} singleton's id is "${definition.type}"`,
      })
    : baseEntitySchema.shape.id;
}

function entitySchema(
  definition: AnyEntityDefinition,
): z.ZodType<EntityOf<AnyEntityDefinition>, unknown> {
  let schema = entitySchemaCache.get(definition);
  if (!schema) {
    schema = baseEntitySchema.extend({
      id: recordIdSchema(definition),
      entityType: z.literal(definition.type),
      metadata: definition.metadataFrom
        ? z.preprocess(definition.metadataFrom, definition.metadata)
        : definition.metadata,
    });
    entitySchemaCache.set(definition, schema);
  }
  return schema;
}

const entityEnvelopeSchema = baseEntitySchema.extend({ metadata: z.unknown() });

export function parseDefinitionEntity<TDefinition extends AnyEntityDefinition>(
  definition: TDefinition,
  input: unknown,
): EntityOf<TDefinition> {
  // The envelope and identity are checked apart from the metadata, so the
  // metadata is migrated and validated exactly once, by the definition's own
  // schema — which is also what proves its definition-typed output.
  const parsed = entityEnvelopeSchema
    .extend({
      id: recordIdSchema(definition),
      entityType: z.literal(definition.type),
    })
    .parse(input);
  return {
    ...parsed,
    entityType: definition.type,
    metadata: parseWithSchema<TDefinition["metadata"]>(
      definition.metadata,
      currentMetadata(definition, parsed.metadata),
    ),
  };
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
        metadata: definition.metadata.parse(
          currentMetadata(definition, input.metadata),
        ),
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
        metadata: definition.metadata.parse(
          currentMetadata(definition, decoded.metadata),
        ),
      };
    },
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (markdown, schemaToParse) =>
      parseMarkdownWithFrontmatter(markdown, schemaToParse).metadata,
    generateFrontMatter(entity): string {
      return generateFrontmatter(encodeParts(definition, entity).frontmatter);
    },
    getBodyTemplate: () => "",
    // Each flag is left off when undeclared: a type that never declared one
    // reads the same as a type written before the flag existed.
    ...(definition.singleton === true && { isSingleton: true }),
    ...(definition.hasBody !== undefined && { hasBody: definition.hasBody }),
    ...(definition.coverImage === true && { supportsCoverImage: true }),
    ...(definition.displayTitle && {
      displayTitle: (entity): string | undefined =>
        displayTitle(definition, entity),
    }),
  };
}

/**
 * The declared label for a stored record. Metadata the schema refuses gets
 * no label rather than an error, so one bad record cannot break a listing;
 * the caller falls back to the record's own title or id.
 */
function displayTitle(
  definition: AnyEntityDefinition,
  entity: { readonly content: string; readonly metadata: unknown },
): string | undefined {
  const metadata = definition.metadata.safeParse(
    currentMetadata(definition, entity.metadata),
  );
  return metadata.success
    ? definition.displayTitle?.({
        content: entity.content,
        metadata: metadata.data,
      })
    : undefined;
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
            visibilityScope: internalFullScope(
              "projection rule loads source entity",
            ),
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
  private readonly entityTypeConfig: EntityTypeConfig;
  private readonly projections: readonly ProjectionDefinition[];
  private readonly scope: (localId: string) => string;
  private readonly validatePersist: AnyEntityDefinition["validatePersist"];
  private readonly seed:
    EntitySeedDefinition<AnyEntityDefinition["metadata"]> | undefined;
  private releaseSeed: (() => void) | undefined;
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
    super(
      scope(definition.type),
      metadata,
      {},
      emptyEntityPluginConfigSchema,
      // Keyed by the bare entity type: the policy is about what may be done
      // to entities of this type, not about which package declared them.
      definition.actions && {
        [definition.type]: entityActionPolicyRuleSchema.parse(
          definition.actions,
        ),
      },
    );
    this.entityTypeConfig = entityTypeConfigFor(
      definition.classification,
      definition.config,
    );
    this.projections = projections;
    this.scope = scope;
    this.validatePersist = definition.validatePersist;
    this.seed = definition.seed;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return this.entityTypeConfig;
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    const validatePersist = this.validatePersist;
    if (validatePersist) {
      context.entities.registerPersistValidator(
        this.entityType,
        async (entity): Promise<void> => {
          await validatePersist(
            Object.freeze({
              content: entity.content,
              visibility: entity.visibility,
            }),
          );
        },
      );
    }

    const seed = this.seed;
    if (seed) {
      this.releaseSeed = context.messaging.subscribe(
        SEED_TRIGGER_CHANNELS[seed.on],
        async (): Promise<{ success: true }> => {
          await this.plantSeed(context, seed);
          return { success: true };
        },
      );
    }
  }

  protected override async onShutdown(): Promise<void> {
    this.releaseSeed?.();
    this.releaseSeed = undefined;
  }

  /** Create-if-absent: a seed never overwrites authored content. */
  private async plantSeed(
    context: EntityPluginContext,
    seed: EntitySeedDefinition<AnyEntityDefinition["metadata"]>,
  ): Promise<void> {
    const existing = await context.entityService.getEntity({
      entityType: this.entityType,
      id: seed.id,
      visibilityScope: internalFullScope(
        "seed checks whether its default exists; no content returned",
      ),
    });
    if (existing) return;
    try {
      await context.entityService.createEntity({
        entity: {
          id: seed.id,
          entityType: this.entityType,
          content: seed.content(),
          metadata: seed.metadata ?? {},
        },
        options: { conditionalWrite: { expectedRevision: null } },
      });
    } catch (error) {
      // Someone created it between the read and the write; theirs stays.
      if (!(error instanceof EntityWriteConflictError)) throw error;
    }
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
