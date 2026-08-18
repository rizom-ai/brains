import {
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type DataSource,
  type EntityAdapter,
  type EntityTypeConfig,
  type ProjectionJsonObject,
  type CreateInput,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import type { Template } from "@brains/templates";
import {
  createDeclarativeDataSource,
  createDeclarativeEntityDataSource,
} from "../public/entity-data-source";
import { DIRECTORY_SYNC_CHANNELS, PUBLISH_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import { SYSTEM_CHANNELS } from "../system-channels";
import type { EntityPluginContext } from "./context";
import { defineProjectionRule, type ProjectionRule } from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import type { JobHandler } from "@brains/job-queue";
import type { ProgressContract } from "@brains/utils/progress";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { FeedRegistry } from "@brains/site-composition";
import type { JobEntityAccess } from "../job/job-context-contract";
import { createJobEntityAccess } from "../job/job-entity-access";
import { entitySchema } from "./entity-schema";
export { parseDefinitionEntity } from "./entity-schema";
import type {
  AnyEntityDefinition,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityJobDeclaration,
  EntityOf,
  EntitySeedTrigger,
  ProjectionDefinition,
} from "./entity-definition-contract";

/**
 * Which declared route a create request takes. Ordered most specific
 * first: an upload reference is a stronger signal than the prompt that
 * may accompany it.
 */
function selectCreateRoute(
  routing: EntityCreateRouting,
  input: CreateInput,
): EntityCreateRoute | undefined {
  if (input.from) return routing.fromUpload;
  if (input.content) return routing.fromContent;
  if (input.prompt) return routing.fromPrompt;
  return undefined;
}

/**
 * Named seed triggers map to internal channels here, so the public
 * surface never names a channel directly.
 */
const SEED_TRIGGER_CHANNELS: Record<EntitySeedTrigger, string> = {
  "content-sync-completed": DIRECTORY_SYNC_CHANNELS.initialCompleted,
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
  private readonly entityTypeConfig: EntityTypeConfig | undefined;
  private readonly seed: AnyEntityDefinition["seed"];
  private readonly templates: AnyEntityDefinition["templates"];
  private readonly dataSources: AnyEntityDefinition["dataSources"];
  private readonly attachments: AnyEntityDefinition["attachments"];
  private readonly generation: AnyEntityDefinition["generation"];
  private readonly evals: AnyEntityDefinition["evals"];
  private readonly jobs: AnyEntityDefinition["jobs"];
  private readonly instructions: AnyEntityDefinition["instructions"];
  private readonly create: AnyEntityDefinition["create"];
  private readonly publish: AnyEntityDefinition["publish"];
  private readonly jobOwnerId: string | undefined;
  private readonly projectionRules: AnyEntityDefinition["projectionRules"];
  private readonly atproto: AnyEntityDefinition["atproto"];
  private readonly feed: AnyEntityDefinition["feed"];
  private readonly releaseOnShutdown: Array<() => void> = [];
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
    jobOwnerId?: string,
  ) {
    super(scope(definition.type), metadata, {}, emptyEntityPluginConfigSchema);
    this.projections = projections;
    this.scope = scope;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
    // Undefined when undeclared, so the runtime keeps its own defaults
    // rather than this surface pinning them.
    this.entityTypeConfig = definition.config
      ? { ...definition.config }
      : undefined;
    this.seed = definition.seed;
    this.templates = definition.templates;
    this.dataSources = definition.dataSources;
    this.attachments = definition.attachments;
    this.generation = definition.generation;
    this.evals = definition.evals;
    this.jobs = definition.jobs;
    this.instructions = definition.instructions;
    this.create = definition.create;
    this.publish = definition.publish;
    this.jobOwnerId = jobOwnerId;
    this.projectionRules = definition.projectionRules;
    this.atproto = definition.atproto;
    this.feed = definition.feed;
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return this.entityTypeConfig;
  }

  protected override getTemplates(): Record<string, Template> | null {
    const templates = this.templates;
    if (!templates) return null;
    // Authors declare local data source ids; a template pointing at one of
    // this entity's own data sources has to follow it to the scoped id the
    // runtime registered. An id declared elsewhere is left alone, so a
    // template can still reference another package's data source.
    const local = new Set((this.dataSources ?? []).map(({ id }) => id));
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
    // Scoped here so two packages can each declare a data source called
    // "entities" without colliding.
    return (this.dataSources ?? []).map((definition) =>
      definition.kind === "rizom-data-source"
        ? createDeclarativeDataSource(definition, this.scope(definition.id))
        : createDeclarativeEntityDataSource(
            definition,
            this.scope(definition.id),
            this.logger,
          ),
    );
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    if (this.create) {
      const routing = this.create;
      context.entities.registerCreateInterceptor(
        this.entityType,
        async (input, executionContext) => {
          const route = selectCreateRoute(routing, input);
          if (!route) return { kind: "continue", input };

          if ("reject" in route) {
            return {
              kind: "handled",
              result: { success: false, error: route.reject },
            };
          }

          // The runtime enqueues and reports, so the outcome describes what
          // actually happened rather than what the package claims happened.
          const jobId = await context.jobs.enqueue({
            // A package may declare its entity and the job it delegates to in
            // one definition, in which case the job belongs to the package
            // rather than to this entity plugin. Qualify it here so the
            // author still writes a bare local job name.
            type: this.jobOwnerId
              ? `${this.jobOwnerId}:${route.delegate}`
              : route.delegate,
            data: input,
            toolContext: executionContext,
            options: {
              source: this.id,
              metadata: { operationType: "content_operations" },
            },
          });
          return {
            kind: "handled",
            result: { success: true, data: { status: "generating", jobId } },
          };
        },
      );
    }

    for (const [jobType, declaration] of Object.entries(this.jobs ?? {})) {
      context.jobs.registerHandler(
        jobType,
        this.jobHandler(declaration, context),
      );
    }

    for (const [handlerId, handler] of Object.entries(this.evals ?? {})) {
      context.eval.registerHandler(handlerId, (input) =>
        handler(input, {
          ai: context.ai,
          logger: this.logger,
          entities: this.entityAccess(context),
          conversations: context.conversations,
        }),
      );
    }

    const publish = this.publish;
    if (publish) {
      // Deferred so the publish pipeline has subscribed before we announce;
      // packages used to hand-roll this ordering one at a time.
      context.messaging.subscribe(
        SYSTEM_CHANNELS.pluginsRegistered,
        async (): Promise<{ success: true }> => {
          await context.messaging.send({
            type: PUBLISH_CHANNELS.register,
            payload: {
              entityType: this.entityType,
              provider: publish.provider,
              config: {
                ...(publish.resultIdField === undefined
                  ? {}
                  : { publishResultIdField: publish.resultIdField }),
                ...(publish.timestampField === undefined
                  ? {}
                  : { publishTimestampField: publish.timestampField }),
              },
            },
          });
          return { success: true };
        },
      );
    }

    const feed = this.feed;
    if (feed) {
      this.releaseOnShutdown.push(
        FeedRegistry.getInstance().register({
          entityType: this.entityType,
          path: feed.path,
          routePrefix: feed.routePrefix,
          toItem: feed.toItem,
        }),
      );
    }

    if (this.atproto) {
      this.releaseOnShutdown.push(
        AtprotoProjectionRegistry.getInstance().register(this.atproto),
      );
    }

    // The runtime keeps the unregister handles so an author never has to.
    for (const attachment of this.attachments ?? []) {
      this.releaseOnShutdown.push(
        context.attachments.register(
          this.entityType,
          attachment.type,
          attachment.provider(context),
        ),
      );
    }

    const seed = this.seed;
    if (!seed) return;

    context.messaging.subscribe(
      SEED_TRIGGER_CHANNELS[seed.on],
      async (): Promise<{ success: true }> => {
        // Create-if-absent: a seed must never overwrite authored content.
        const existing = await context.entityService.getEntity({
          entityType: this.entityType,
          id: seed.id,
        });
        if (existing) return { success: true };

        await context.entityService.createEntity({
          entity: {
            id: seed.id,
            entityType: this.entityType,
            content: seed.content(),
            metadata: seed.metadata ?? {},
          },
        });
        return { success: true };
      },
    );
  }

  protected override async getInstructions(): Promise<string> {
    return this.instructions ?? "";
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return this.generation ? this.jobHandler(this.generation, context) : null;
  }

  private jobHandler(
    declaration: EntityJobDeclaration,
    context: EntityPluginContext,
  ): JobHandler {
    return {
      // Input is the author\u0027s declared schema, so a malformed job is
      // rejected before their code runs.
      validateAndParse: (data: unknown): unknown => {
        const parsed = declaration.input.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process: async (
        data: unknown,
        _jobId: string,
        progress: ProgressContract,
        signal: AbortSignal,
      ): Promise<unknown> =>
        declaration.handle({
          input: data,
          progress,
          signal,
          ai: context.ai,
          logger: this.logger,
          entities: this.entityAccess(context),
          messaging: {
            publish: async (message): Promise<void> => {
              await context.messaging.send({
                type: message.topic,
                payload: message.data,
              });
            },
          },
          conversations: context.conversations,
        }),
    };
  }

  private entityAccess(context: EntityPluginContext): JobEntityAccess {
    return createJobEntityAccess(
      context.entityService,
      new Set([this.entityType]),
      this.id,
    );
  }

  protected override async onShutdown(): Promise<void> {
    for (const release of this.releaseOnShutdown.splice(0)) release();
  }

  protected override getProjectionRules(): ProjectionRule[] {
    // Rules declared outright come through as-is; they already carry their
    // own id, since an entity derived from many sources has no single
    // source definition to scope against.
    return [
      ...this.projections.map((projection) =>
        projectionRule(projection, this.version, this.scope),
      ),
      ...(this.projectionRules ?? []),
    ];
  }
}

export function createEntityPackagePlugins(
  entities: readonly AnyEntityDefinition[],
  projections: readonly ProjectionDefinition[],
  metadata: InstalledPluginPackageMetadata,
  scope: (localId: string) => string,
  jobOwnerId?: string,
): DeclarativeEntityPlugin[] {
  return entities.map(
    (definition) =>
      new DeclarativeEntityPlugin(
        definition,
        projections.filter(({ source }) => source === definition),
        metadata,
        scope,
        jobOwnerId,
      ),
  );
}
