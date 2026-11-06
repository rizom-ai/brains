import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  siteBuildStagingContract,
  type SiteBuildStagingPayload,
} from "@brains/contracts";
import {
  EntityWriteConflictError,
  internalFullScope,
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type DataSource,
  type EntityAdapter,
  type EntityTypeConfig,
  type ProjectionJsonObject,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import { feedItemSchema, renderRssFeed } from "@brains/site-composition";
import { entityActionPolicyRuleSchema, type Template } from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import type { EntityPluginContext } from "./context";
import { entityTypeConfigFor } from "./entity-definition-config";
import {
  currentMetadata,
  entitySchema,
  parseDefinitionEntity,
} from "./entity-schema";
import { defineProjectionRule, type ProjectionRule } from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import { SYSTEM_CHANNELS } from "../system-channels";
import { createDeclaredDataSource } from "../public/entity-data-source";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDefinition,
  EntityFeedDeclaration,
  EntityOf,
  EntitySeedDefinition,
  EntitySeedTrigger,
  ProjectionDefinition,
} from "./entity-definition-contract";

export { parseDefinitionEntity } from "./entity-schema";

/**
 * Named seed triggers map to internal channels here, so the public surface
 * never names a channel.
 */
const SEED_TRIGGER_CHANNELS: Record<EntitySeedTrigger, string> = {
  "startup-content-settled": SYSTEM_CHANNELS.startupContentSettled,
};

const rawFrontmatterSchema = z.record(z.string(), z.unknown());

/** A feed path stays inside the build output: relative, no parent steps. */
const feedPathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((segment) => segment !== "" && segment !== ".."),
    { message: "A feed path is relative to the build output" },
  );

const projectionEnvelopeSchema = z.object({
  items: z.array(
    z.object({
      operation: z.enum(["upsert", "delete"]),
      id: z.string(),
      source: ProjectionJsonObjectSchema.optional(),
    }),
  ),
});

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
  private readonly templates: AnyEntityDefinition["templates"];
  private readonly dataSources: readonly AnyDataSourceDeclaration[];
  private readonly packageDataSourceIds: ReadonlySet<string>;
  private readonly feed:
    EntityFeedDeclaration<EntityOf<AnyEntityDefinition>> | undefined;
  private readonly definition: AnyEntityDefinition;
  private releases: readonly (() => void)[] = [];
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
    dataSources: readonly AnyDataSourceDeclaration[],
    packageDataSourceIds: ReadonlySet<string>,
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
    this.templates = definition.templates;
    this.dataSources = dataSources;
    this.packageDataSourceIds = packageDataSourceIds;
    if (definition.feed) feedPathSchema.parse(definition.feed.path);
    this.feed = definition.feed;
    this.definition = definition;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return this.entityTypeConfig;
  }

  protected override getTemplates(): Record<string, Template> | null {
    const templates = this.templates;
    if (!templates) return null;
    // A template naming one of its package's data sources follows it to the
    // scoped id it registers under; any other id is left as written.
    const local = this.packageDataSourceIds;
    return Object.fromEntries(
      Object.entries(templates).map(([name, template]) => [
        name,
        template.dataSourceId && local.has(template.dataSourceId)
          ? { ...template, dataSourceId: this.scope(template.dataSourceId) }
          : template,
      ]),
    );
  }

  protected override getDataSources(): DataSource[] {
    // Scoped to the package, so two packages may each declare "entities".
    return this.dataSources.map((declaration) =>
      createDeclaredDataSource(
        declaration,
        this.scope(declaration.id),
        this.logger,
      ),
    );
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
    const feed = this.feed;
    this.releases = [
      ...(seed
        ? [
            context.messaging.subscribe(
              SEED_TRIGGER_CHANNELS[seed.on],
              async (): Promise<{ success: true }> => {
                await this.plantSeed(context, seed);
                return { success: true };
              },
            ),
          ]
        : []),
      ...(feed
        ? [
            // Builds run in the worker, so every process answers.
            context.messaging.answer(
              siteBuildStagingContract,
              (payload) => this.stageFeed(context, feed, payload),
              { everyProcess: true },
            ),
          ]
        : []),
    ];
  }

  protected override async onShutdown(): Promise<void> {
    this.releases.forEach((release) => release());
    this.releases = [];
  }

  /**
   * Write this type's feed into the staged build. A failure is reported
   * rather than thrown, so the build fails and keeps the previous generation
   * instead of publishing one without the feed.
   */
  private async stageFeed(
    context: EntityPluginContext,
    feed: EntityFeedDeclaration<EntityOf<AnyEntityDefinition>>,
    payload: SiteBuildStagingPayload,
  ): Promise<void> {
    try {
      await this.writeFeed(context, feed, payload);
    } catch (error) {
      this.logger.error(`Failed to write the ${this.entityType} feed`, error);
      payload.reportFailure(
        `${this.entityType} feed generation failed: ${getErrorMessage(error)}`,
      );
    }
  }

  private async writeFeed(
    context: EntityPluginContext,
    feed: EntityFeedDeclaration<EntityOf<AnyEntityDefinition>>,
    payload: SiteBuildStagingPayload,
  ): Promise<void> {
    // A preview carries everything so an author sees unpublished work in
    // place; a production build carries what the type counts as published.
    const stored = await context.entityService.listEntities({
      entityType: this.entityType,
      options: {
        limit: 1000,
        publishedOnly: payload.environment === "production",
      },
    });
    const items = stored.flatMap((entity) => {
      const item = feed.toItem(parseDefinitionEntity(this.definition, entity));
      return item ? [feedItemSchema.parse(item)] : [];
    });
    if (items.length === 0) return;

    const siteUrl = (payload.siteConfig.url ?? "https://example.com").replace(
      /\/+$/u,
      "",
    );
    const xml = renderRssFeed(
      items,
      {
        title: payload.siteConfig.title ?? "Feed",
        description: payload.siteConfig.description ?? "Latest updates",
        link: `${siteUrl}/${feed.routePrefix.replace(/^\/+/u, "")}`,
        selfLink: `${siteUrl}/${feed.path}`,
        copyright: payload.siteConfig.copyright,
      },
      (item) =>
        `${siteUrl}/${payload
          .generateEntityUrl(this.entityType, item.slug)
          .replace(/^\/+/u, "")}`,
    );
    const target = join(payload.outputDir, feed.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, xml, "utf8");
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

/**
 * The plugin that registers a package data source: an entity data source
 * with the type it reads, a fetching one with the package's first type.
 */
function installsDataSource(
  source: AnyDataSourceDeclaration,
  definition: AnyEntityDefinition,
  entities: readonly AnyEntityDefinition[],
): boolean {
  return source.kind === "rizom-entity-data-source"
    ? source.entity === definition
    : entities[0] === definition;
}

export function createEntityPackagePlugins(
  entities: readonly AnyEntityDefinition[],
  projections: readonly ProjectionDefinition[],
  metadata: InstalledPluginPackageMetadata,
  scope: (localId: string) => string,
  dataSources: readonly AnyDataSourceDeclaration[] = [],
): DeclarativeEntityPlugin[] {
  const packageDataSourceIds = new Set(dataSources.map(({ id }) => id));
  return entities.map(
    (definition) =>
      new DeclarativeEntityPlugin(
        definition,
        projections.filter(({ source }) => source === definition),
        metadata,
        scope,
        dataSources.filter((source) =>
          installsDataSource(source, definition, entities),
        ),
        packageDataSourceIds,
      ),
  );
}
