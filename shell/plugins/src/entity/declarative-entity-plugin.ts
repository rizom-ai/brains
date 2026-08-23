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
  type BaseEntity,
  type CreateInput,
  type CreateInterceptor,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import type { Template } from "@brains/templates";
import {
  createDeclarativeDataSource,
  createDeclarativeEntityDataSource,
} from "../public/entity-data-source";
import {
  DIRECTORY_SYNC_CHANNELS,
  GENERATE_CHANNELS,
  PUBLISH_ASSET_CHANNELS,
  PUBLISH_CHANNELS,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import { SYSTEM_CHANNELS } from "../system-channels";
import type { EntityPluginContext } from "./context";
import { defineProjectionRule, type ProjectionRule } from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import type { JobHandler } from "@brains/job-queue";
import type { ProgressContract } from "@brains/utils/progress";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { registerBuiltInDashboardWidget } from "../operator/dashboard-widget-runtime";
import { FeedRegistry } from "@brains/site-composition";
import { slugify } from "@brains/utils/string-utils";
import type {
  JobEntityAccess,
  JobHandlerContext,
} from "../job/job-context-contract";
import { createJobEntityAccess } from "../job/job-entity-access";
import { saveProcessedEntity } from "./pending-ingestion";
import type { ScopedRuntimeUploadStore } from "../service/upload-registry";
import { createEvalFixtures } from "./eval-fixtures";
import { entitySchema, parseDefinitionEntity } from "./entity-schema";
import type { EntityDefinitionShape } from "./entity-shape";
export { parseDefinitionEntity } from "./entity-schema";
import type {
  AnyEntityDefinition,
  AnyEntityJobDeclaration,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityGenerationResult,
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
  // `from` already discriminates, so the routing keys follow it rather than
  // funnelling every ref kind through one route that has to re-check.
  if (input.from) {
    return input.from.kind === "entity-attachment"
      ? routing.fromAttachment
      : routing.fromUpload;
  }
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

/**
 * The entity a generation was told to fill in, if the caller allocated one.
 *
 * Read off the raw input rather than a declared field so a package need not
 * declare `entityId` to take part in the lifecycle.
 */
function preallocatedEntityId(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("entityId" in data)) {
    return undefined;
  }
  const entityId = data.entityId;
  return typeof entityId === "string" && entityId.trim().length > 0
    ? entityId.trim()
    : undefined;
}

/**
 * The content hash the entity had when it was allocated, if the caller
 * recorded one.
 *
 * A generation fills in an entity somebody is already looking at, and they
 * may edit it while the job runs. Carrying the hash from allocation through
 * to the write is what lets the edit win instead of being silently
 * overwritten by work that started before it.
 */
function preallocatedContentHash(data: unknown): string | undefined {
  if (
    typeof data !== "object" ||
    data === null ||
    !("expectedContentHash" in data)
  ) {
    return undefined;
  }
  const hash = data.expectedContentHash;
  return typeof hash === "string" && hash.length > 0 ? hash : undefined;
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

/**
 * Where a template this entity declared ends up once the runtime scopes it.
 *
 * Unknown names throw here rather than being passed through: a name nothing
 * declares would otherwise surface as "Template not found" during
 * generation, long after the declaration that caused it.
 */
function scopedTemplateName(
  templates: AnyEntityDefinition["templates"],
  entityType: string,
  pluginId: string,
  localName: string,
): string {
  if (!Object.hasOwn(templates ?? {}, localName)) {
    throw new Error(
      `Entity "${entityType}" declares no template named "${localName}"`,
    );
  }
  return `${pluginId}:${localName}`;
}

function entityAdapter(
  definition: AnyEntityDefinition,
): EntityAdapter<EntityOf<EntityDefinitionShape>, Record<string, unknown>> {
  const schema = entitySchema(definition);
  return {
    entityType: definition.type,
    purpose: definition.purpose,
    schema,
    frontmatterSchema: definition.metadata,
    toMarkdown(entity): string {
      return encodeEntityMarkdown(definition, entity);
    },
    /**
     * What the file says, and only that.
     *
     * Deliberately not validated against the metadata schema: this returns a
     * partial, and for an entity whose metadata does not live in its content
     * — a document is a data URL with its filename and media type in a
     * sidecar — directory-sync merges this half with the other before
     * anything is written. Enforcing the schema here would reject an object
     * that was never meant to be complete. Every write still validates the
     * assembled entity through `entityRegistry.validateEntity`, so the
     * guarantee moves to where the whole entity exists rather than
     * disappearing.
     */
    fromMarkdown(markdown): Partial<EntityOf<EntityDefinitionShape>> {
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
        metadata:
          decoded.metadata as EntityOf<EntityDefinitionShape>["metadata"],
      };
    },
    extractMetadata: (entity) => entity.metadata,
    parseFrontMatter: (markdown, schemaToParse) =>
      parseMarkdownWithFrontmatter(markdown, schemaToParse).metadata,
    generateFrontMatter(entity): string {
      return generateFrontmatter(encodeParts(definition, entity).frontmatter);
    },
    getBodyTemplate: () => "",
    // Left off entirely when undeclared: system_generate reads its absence
    // as "this type does not support queued generation" and says so.
    ...(definition.stub ? { buildStub: definition.stub } : {}),
  };
}

export async function deriveProjectionUpserts(
  projection: ProjectionDefinition,
  rawSource: ProjectionJsonObject,
  signal: AbortSignal,
): Promise<ProjectionWriteIntent[]> {
  // Narrowed to the projection's own source definition, so `project`
  // receives the entity type it declared rather than the erased one.
  const source = parseDefinitionEntity(projection.source, rawSource);
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
  EntityOf<EntityDefinitionShape>,
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
  private readonly scheduledGeneration: AnyEntityDefinition["scheduledGeneration"];
  private readonly evals: AnyEntityDefinition["evals"];
  private readonly insights: AnyEntityDefinition["insights"];
  private readonly dashboardWidgets: AnyEntityDefinition["dashboardWidgets"];
  private readonly jobs: AnyEntityDefinition["jobs"];
  private readonly instructions: AnyEntityDefinition["instructions"];
  private readonly create: AnyEntityDefinition["create"];
  private readonly publish: AnyEntityDefinition["publish"];
  private readonly publishAssets: AnyEntityDefinition["publishAssets"];
  private readonly jobOwnerId: string | undefined;
  // Resolved at construction: the declared form may be a function, but a
  // plugin holds the rules themselves.
  private readonly projectionRules: readonly ProjectionRule[];
  private readonly atproto: AnyEntityDefinition["atproto"];
  private readonly feed: AnyEntityDefinition["feed"];
  private readonly releaseOnShutdown: Array<() => void> = [];
  public readonly entityType: string;
  public readonly schema: z.ZodType<EntityOf<EntityDefinitionShape>, unknown>;
  public readonly adapter: EntityAdapter<
    EntityOf<EntityDefinitionShape>,
    Record<string, unknown>
  >;

  constructor(
    definition: AnyEntityDefinition,
    projections: readonly ProjectionDefinition[],
    metadata: InstalledPluginPackageMetadata,
    scope: (localId: string) => string,
    jobOwnerId?: string,
    configuredRules: readonly ProjectionRule[] = [],
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
    this.scheduledGeneration = definition.scheduledGeneration;
    this.evals = definition.evals;
    this.insights = definition.insights;
    this.dashboardWidgets = definition.dashboardWidgets;
    this.jobs = definition.jobs;
    this.instructions = definition.instructions;
    this.create = definition.create;
    this.publish = definition.publish;
    this.publishAssets = definition.publishAssets;
    this.jobOwnerId = jobOwnerId;
    const declared = definition.projectionRules;
    this.projectionRules = [
      ...(typeof declared === "function"
        ? declared({
            template: (localName) =>
              scopedTemplateName(
                definition.templates,
                definition.type,
                scope(definition.type),
                localName,
              ),
          })
        : (declared ?? [])),
      ...configuredRules,
    ];
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
      const interceptCreate: CreateInterceptor = async (
        input,
        executionContext,
      ) => {
        const route = selectCreateRoute(routing, input);
        if (!route) return { kind: "continue", input };

        if ("reject" in route) {
          return {
            kind: "handled",
            result: { success: false, error: route.reject },
          };
        }

        if ("resolve" in route) {
          const resolution = await route.resolve({
            input,
            entities: this.entityAccess(context),
            logger: this.logger,
            uploads: this.uploadReader(context),
          });
          if ("refuse" in resolution) {
            return {
              kind: "handled",
              result: { success: false, error: resolution.refuse },
            };
          }
          // Allocate now, finish later. Deduplicating the id here is what
          // makes the returned id worth handing back: a second import of
          // the same file lands on the entity the first one made.
          if ("delegate" in resolution) {
            const written = await context.entityService.createEntity({
              entity: {
                id: resolution.create.id,
                entityType: this.entityType,
                content: resolution.create.content,
                metadata: resolution.create.metadata,
                ...(input.visibility !== undefined
                  ? { visibility: input.visibility }
                  : {}),
              },
              options: { deduplicateId: true },
            });
            // The placeholder's hash travels with the job, so an edit
            // made while the job runs wins over work that started before
            // it rather than being silently overwritten.
            const placeholder = await context.entityService.getEntity({
              entityType: this.entityType,
              id: written.entityId,
            });
            const jobId = await context.jobs.enqueue({
              type: this.jobOwnerId
                ? `${this.jobOwnerId}:${resolution.delegate.job}`
                : `${this.id}:${resolution.delegate.job}`,
              data: {
                ...(resolution.delegate.input ?? {}),
                entityId: written.entityId,
                ...(placeholder
                  ? { expectedContentHash: placeholder.contentHash }
                  : {}),
              },
              toolContext: executionContext,
              options: {
                source: this.id,
                metadata: { operationType: "content_operations" },
              },
            });
            return {
              kind: "handled",
              result: {
                success: true,
                data: {
                  status: "generating",
                  entityId: written.entityId,
                  jobId,
                },
              },
            };
          }
          // The runtime performs the write, so "created" and "updated"
          // describe what it did rather than what the route claims.
          if ("update" in resolution) {
            const existing = await context.entityService.getEntity({
              entityType: this.entityType,
              id: resolution.update.id,
            });
            if (!existing) {
              return {
                kind: "handled",
                result: {
                  success: false,
                  error: `Cannot update ${this.entityType} "${resolution.update.id}", which does not exist`,
                },
              };
            }
            const written = await context.entityService.updateEntity({
              entity: {
                ...existing,
                content: resolution.update.content,
                metadata: resolution.update.metadata,
              },
            });
            return {
              kind: "handled",
              result: {
                success: true,
                data: { status: "updated", entityId: written.entityId },
              },
            };
          }
          const written = await context.entityService.createEntity({
            entity: {
              id: resolution.create.id,
              entityType: this.entityType,
              content: resolution.create.content,
              metadata: resolution.create.metadata,
            },
          });
          const attachment = resolution.attachment?.({
            entityId: written.entityId,
          });
          return {
            kind: "handled",
            result: {
              success: true,
              data: {
                status: "created",
                entityId: written.entityId,
                ...(attachment ? { attachment } : {}),
              },
            },
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
      };
      context.entities.registerCreateInterceptor(
        this.entityType,
        interceptCreate,
      );

      // Same decision, second entry point: the upload endpoint routes by
      // media type and hands the ref straight to the route that claimed it,
      // instead of a package registering a handler that calls its own create
      // logic back.
      const fromUpload = routing.fromUpload;
      if (fromUpload && "mediaTypes" in fromUpload && fromUpload.mediaTypes) {
        context.entities.registerUploadSaveHandler({
          entityType: this.entityType,
          mediaTypes: [...fromUpload.mediaTypes],
          handler: async (input, executionContext) => {
            const outcome = await interceptCreate(
              {
                entityType: this.entityType,
                from: input.upload,
                ...(input.title !== undefined ? { title: input.title } : {}),
                ...(input.visibility !== undefined
                  ? { visibility: input.visibility }
                  : {}),
              },
              executionContext,
            );
            return outcome.kind === "handled"
              ? outcome.result
              : {
                  success: false,
                  error: `Upload was not handled by ${this.entityType}`,
                };
          },
        });
      }
    }

    for (const [jobType, declaration] of Object.entries(this.jobs ?? {})) {
      context.jobs.registerHandler(
        jobType,
        this.jobHandler(declaration, context),
      );
    }

    for (const [insightId, handler] of Object.entries(this.insights ?? {})) {
      context.insights.register(insightId, async (_service, visibilityScope) =>
        handler({
          entities: this.entityAccess(context),
          visibilityScope,
        }),
      );
    }

    for (const [handlerId, handler] of Object.entries(this.evals ?? {})) {
      context.eval.registerHandler(handlerId, (input) =>
        handler(input, {
          ai: context.ai,
          logger: this.logger,
          entities: this.entityAccess(context),
          conversations: context.conversations,
          runProjectionRule: (rule) => context.eval.runProjectionRule(rule),
          fixtures: createEvalFixtures(context.entityService, [
            this.entityType,
          ]),
          template: (localName) =>
            scopedTemplateName(
              this.templates,
              this.entityType,
              this.id,
              localName,
            ),
        }),
      );
    }

    const publishAssets = this.publishAssets ?? [];
    if (publishAssets.length > 0) {
      // Same deferral as publish: the pipeline has to be listening before
      // anything announces to it.
      context.messaging.subscribe(
        SYSTEM_CHANNELS.pluginsRegistered,
        async (): Promise<{ success: true }> => {
          for (const asset of publishAssets) {
            await context.messaging.send({
              type: PUBLISH_ASSET_CHANNELS.register,
              payload: { ...asset, entityType: this.entityType },
            });
          }
          return { success: true };
        },
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

    this.registerDashboardWidgets(context);
    this.subscribeToScheduledGeneration(context);

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
    const generation = this.generation;
    if (!generation) return null;

    return {
      validateAndParse: (data: unknown): unknown => {
        const parsed = generation.input.safeParse(data);
        return parsed.success ? parsed.data : null;
      },
      process: async (
        data: unknown,
        _jobId: string,
        progress: ProgressContract,
        signal: AbortSignal,
      ): Promise<unknown> =>
        this.runGeneration(context, data, (entityId) =>
          generation.generate({
            ...this.jobContext(data, context, progress, signal),
            entityId,
          }),
        ),
    };
  }

  /**
   * Write what a generation produced.
   *
   * A pre-allocated entity is filled in — the caller is already looking at
   * it — and its generation-lifecycle fields are cleared. Otherwise the id
   * comes from the returned title, deduplicated the same way the stub is.
   */
  private async saveGenerated(
    context: EntityPluginContext,
    entityId: string | undefined,
    result: Extract<EntityGenerationResult, { success: true }>,
    expectedContentHash?: string,
  ): Promise<{ success: true; entityId: string }> {
    const { status: _status, error: _error, ...metadata } = result.metadata;
    const title = metadata["title"];
    const id =
      entityId ?? result.id ?? slugify(String(title ?? this.entityType));

    if (entityId) {
      const saved = await saveProcessedEntity({
        entityService: context.entityService,
        entity: {
          ...(await this.requireEntity(context, entityId)),
          content: result.content,
          metadata,
        },
        ...(expectedContentHash !== undefined ? { expectedContentHash } : {}),
      });
      return {
        success: true,
        entityId: saved.entityId,
        ...(saved.mutation.skipReason === "content-conflict"
          ? { status: "superseded" }
          : {}),
        ...(result.resultExtras ?? {}),
      };
    }

    const written = await context.entityService.createEntity({
      entity: {
        id,
        entityType: this.entityType,
        content: result.content,
        metadata,
      },
      options: { deduplicateId: true },
    });

    return {
      success: true,
      entityId: written.entityId,
      ...(result.resultExtras ?? {}),
    };
  }

  /**
   * Close the loop the scheduler opened.
   *
   * Only for a type that declares scheduledGeneration: that declaration is
   * what says this type takes part in the scheduler's protocol. The report
   * carries the entity id, which a declaration cannot know — it hands back
   * content and the runtime decides where it lands.
   */
  private async reportGenerationCompleted(
    context: EntityPluginContext,
    entityId: string,
  ): Promise<void> {
    if (!this.scheduledGeneration) return;
    await context.messaging.send({
      type: GENERATE_CHANNELS.reportSuccess,
      payload: { entityType: this.entityType, entityId },
    });
  }

  private async reportGenerationFailed(
    context: EntityPluginContext,
    error: string,
  ): Promise<void> {
    if (!this.scheduledGeneration) return;
    await context.messaging.send({
      type: GENERATE_CHANNELS.reportFailure,
      payload: { entityType: this.entityType, error },
    });
  }

  private async requireEntity(
    context: EntityPluginContext,
    entityId: string,
  ): Promise<BaseEntity> {
    const existing = await context.entityService.getEntity({
      entityType: this.entityType,
      id: entityId,
    });
    if (!existing) {
      throw new Error(
        `Generation was told to fill in ${this.entityType} "${entityId}", which does not exist`,
      );
    }
    return existing;
  }

  /**
   * Leave a failed generation visibly failed rather than generating forever.
   */
  private async markGenerationFailed(
    context: EntityPluginContext,
    entityId: string | undefined,
    error: string,
  ): Promise<void> {
    if (!entityId) return;
    const existing = await context.entityService.getEntity({
      entityType: this.entityType,
      id: entityId,
    });
    if (!existing) return;
    await context.entityService.updateEntity({
      entity: {
        ...existing,
        metadata: { ...existing.metadata, status: "failed", error },
      },
    });
  }

  /**
   * Announce declared dashboard widgets once the Dashboard host has mounted.
   *
   * Four packages waited on this lifecycle event by hand to do exactly this.
   * The wait is the runtime's, so a declaration says what the widget is and
   * how to fill it and nothing more.
   */
  private registerDashboardWidgets(context: EntityPluginContext): void {
    const widgets = this.dashboardWidgets ?? [];
    if (widgets.length === 0) return;

    context.messaging.subscribe(
      SYSTEM_CHANNELS.pluginsRegistered,
      async (): Promise<{ success: true }> => {
        for (const widget of widgets) {
          await registerBuiltInDashboardWidget({
            context,
            definition: widget.definition,
            load: ({ caller, signal }) =>
              widget.load({
                entities: this.entityAccess(context),
                caller,
                signal,
              }),
          });
        }
        return { success: true };
      },
    );
  }

  /**
   * Answer a scheduled request for an entity of this type.
   *
   * The scheduler says "generate a guide" and nothing more, so the runtime
   * finds the material: recent sources of the declared type and status, in
   * `each` mode skipping any this type has already been derived from. With
   * nothing to write from it reports a failure, which is what the scheduler
   * is waiting to hear either way.
   */
  private subscribeToScheduledGeneration(context: EntityPluginContext): void {
    const scheduled = this.scheduledGeneration;
    if (!scheduled) return;

    context.messaging.subscribe<{ entityType: string }, { success: boolean }>(
      GENERATE_CHANNELS.execute,
      async (message) => {
        if (message.payload.entityType !== this.entityType) {
          return { success: true };
        }

        const reportFailure = async (error: string): Promise<void> => {
          await context.messaging.send({
            type: GENERATE_CHANNELS.reportFailure,
            payload: { entityType: this.entityType, error },
          });
        };

        try {
          const sources = await context.entityService.listEntities({
            entityType: scheduled.from.entityType,
            options: {
              ...(scheduled.from.status === undefined
                ? {}
                : { filter: { metadata: { status: scheduled.from.status } } }),
              limit: scheduled.from.limit,
            },
          });

          const data = await this.selectScheduledSources(
            context,
            scheduled,
            sources.map((source) => source.id),
          );
          if (!data) {
            await reportFailure(
              `No ${[scheduled.from.status, scheduled.from.entityType]
                .filter(Boolean)
                .join(" ")} available to write a ${this.entityType} from`,
            );
            return { success: true };
          }

          await context.jobs.enqueue({
            type: `${this.entityType}:generation`,
            data,
            toolContext: {
              interfaceType: "job",
              actor: { kind: "service", serviceId: this.id },
            },
          });
          return { success: true };
        } catch (error) {
          await reportFailure(getErrorMessage(error));
          return { success: true };
        }
      },
    );
  }

  /**
   * The generation input for a scheduled request, or null when there is
   * nothing left to write from.
   */
  private async selectScheduledSources(
    context: EntityPluginContext,
    scheduled: NonNullable<AnyEntityDefinition["scheduledGeneration"]>,
    sourceIds: readonly string[],
  ): Promise<Record<string, unknown> | null> {
    if (sourceIds.length === 0) return null;

    if (scheduled.mode === "batch") {
      return {
        sourceEntityType: scheduled.from.entityType,
        sourceEntityIds: [...sourceIds],
      };
    }

    for (const sourceEntityId of sourceIds) {
      const derived = await context.entityService.listEntities({
        entityType: this.entityType,
        options: {
          filter: {
            metadata: {
              sourceEntityType: scheduled.from.entityType,
              sourceEntityId,
            },
          },
          limit: 1,
        },
      });
      if (derived.length === 0) {
        return {
          sourceEntityType: scheduled.from.entityType,
          sourceEntityId,
        };
      }
    }
    return null;
  }

  private jobHandler(
    declaration: AnyEntityJobDeclaration,
    context: EntityPluginContext,
  ): JobHandler {
    return {
      // Input is the author's declared schema, so a malformed job is
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
      ): Promise<unknown> => {
        const jobContext = this.jobContext(data, context, progress, signal);
        if ("handle" in declaration) return declaration.handle(jobContext);
        // Declared with `generate`, so the entity's lifecycle belongs to
        // the runtime: the write on success, the failure marking on error.
        return this.runGeneration(context, data, (entityId) =>
          declaration.generate({ ...jobContext, entityId }),
        );
      },
    };
  }

  /**
   * Run a generation and own what happens to the entity either way.
   *
   * Shared by the `generation` slot and by any declared job that fills in
   * an allocated entity, because leaving one stuck in "generating" with
   * nobody left to say why is the same bug whichever declared it.
   */
  private async runGeneration(
    context: EntityPluginContext,
    data: unknown,
    run: (entityId: string | undefined) => Promise<EntityGenerationResult>,
  ): Promise<unknown> {
    const entityId = preallocatedEntityId(data);
    try {
      const result = await run(entityId);
      if (!result.success) {
        await this.markGenerationFailed(context, entityId, result.error);
        await this.reportGenerationFailed(context, result.error);
        return { success: false, error: result.error };
      }
      const saved = await this.saveGenerated(
        context,
        entityId,
        result,
        preallocatedContentHash(data),
      );
      await this.reportGenerationCompleted(context, saved.entityId);
      return saved;
    } catch (error) {
      const message = getErrorMessage(error);
      await this.markGenerationFailed(context, entityId, message);
      await this.reportGenerationFailed(context, message);
      return { success: false, error: message };
    }
  }

  /** What every declared job and generation is given. */
  private jobContext(
    input: unknown,
    context: EntityPluginContext,
    progress: ProgressContract,
    signal: AbortSignal,
  ): JobHandlerContext<unknown> {
    return {
      input,
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
      identity: context.identity,
      // Templates declared on this entity register under this plugin's id.
      template: (localName) =>
        scopedTemplateName(this.templates, this.entityType, this.id, localName),
      uploads: this.uploadReader(context),
      attachments: context.attachments,
    };
  }

  /**
   * The runtime's own upload namespace. A package never names one: only the
   * namespace decides which bytes come back, and every interface that
   * accepts a file writes into the same one.
   */
  private uploadReader(context: EntityPluginContext): ScopedRuntimeUploadStore {
    return context.uploads.scoped({
      namespace: "upload",
      refKind: "upload",
      routePath: "/api/uploads",
    });
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
      ...this.projectionRules,
    ];
  }
}

export function createEntityPackagePlugins(
  entities: readonly AnyEntityDefinition[],
  projections: readonly ProjectionDefinition[],
  metadata: InstalledPluginPackageMetadata,
  scope: (localId: string) => string,
  jobOwnerId?: string,
  /**
   * Rules a service half derived from its configuration. Each joins the
   * entity plugin whose type it targets, so the runtime sees it as that
   * entity's rule rather than a third kind of registration.
   */
  configuredRules: readonly ProjectionRule[] = [],
): DeclarativeEntityPlugin[] {
  return entities.map(
    (definition) =>
      new DeclarativeEntityPlugin(
        definition,
        projections.filter(({ source }) => source === definition),
        metadata,
        scope,
        jobOwnerId,
        configuredRules.filter(
          ({ targetType }) => targetType === definition.type,
        ),
      ),
  );
}
