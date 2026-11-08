import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  agentContextContract,
  generateExecuteContract,
  generateReportFailureContract,
  publishAssetRegisterContract,
  publishRegisterContract,
  siteBuildStagingContract,
  type SiteBuildStagingPayload,
} from "@brains/contracts";
import {
  EntityWriteConflictError,
  createResultAttachmentSchema,
  internalFullScope,
  permissionToVisibilityScope,
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
  type ContentVisibility,
  type CreateCheckResult,
  type CreateExecutionContext,
  type CreateInput,
  type CreateInterceptionResult,
  type CreateInterceptor,
  type CreateResult,
  type DataSource,
  type EntityAdapter,
  type EntitySchema,
  type EntityTypeConfig,
  type ProjectionJsonObject,
  type ProjectionWriteIntent,
} from "@brains/entity-service";
import type {
  AtprotoBlobRef,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { feedItemSchema, renderRssFeed } from "@brains/site-composition";
import {
  entityActionPolicyRuleSchema,
  type EntityActionRequiredLevel,
  type PermissionService,
  type Template,
} from "@brains/templates";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import { getErrorMessage } from "@brains/utils/error";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "./entity-plugin";
import type { EntityPluginContext } from "./context";
import { entityTypeConfigFor } from "./entity-definition-config";
import { createEntityReader } from "./entity-reader";
import {
  contractJobOf,
  ordinaryCreateOf,
  queuedCreateOf,
  storedCreateOf,
  withEntityRuntime,
  type AnyEntityBinding,
  type EntityRuntimeBinding,
  type QueuedCreate,
  type StoredCreate,
} from "./entity-runtime";
import { createUploadSaveHandler } from "./upload-save";
import { sharedUploadScope } from "../service/upload-registry";
import {
  admitPackageJob,
  createPackageEntityReader,
  packageReadScope,
  packageSelfCall,
  toolCaller,
} from "../service/job-authority";
import {
  DeclarativeGenerationHandler,
  createEvalFixtures,
  createGenerationAI,
  contractJobHandler,
  entityJobHandler,
  type EntityJobWrites,
  generationSource,
} from "./declarative-jobs";
import type { JobHandler, JobOptions } from "@brains/job-queue";
import { createPendingEntity } from "./pending-ingestion";
import {
  currentMetadata,
  entitySchema,
  parseDefinitionEntity,
} from "./entity-schema";
import {
  defineProjectionRule,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionRule,
} from "./projection-rule";
import type { InstalledPluginPackageMetadata } from "../package-definition";
import { createDeclarativeDashboardWidgetRegistration } from "../operator/dashboard-widget-runtime";
import type {
  AnyDashboardWidgetDefinition,
  BoundDashboardWidget,
} from "../operator/operator-definition-contract";
import type {
  InboxActor,
  InboxItem,
  InboxItemDetail,
  InboxSource,
} from "../inbox-registry";
import { SYSTEM_CHANNELS } from "../system-channels";
import { createDeclaredDataSource } from "../public/entity-data-source";
import type {
  AnyDataSourceDeclaration,
  AnyEntityDefinition,
  AnyEntityJobDeclaration,
  EntityCreateAllocation,
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityAtprotoProjection,
  EntityDashboardBindingContext,
  EntityDashboardWidget,
  EntityInboxActionContext,
  EntityInboxChange,
  EntityInboxDeclaration,
  EntityInboxEdits,
  EntityReader,
  EntityRecordReader,
  DataSourceListOptions,
  EntityCreateUploadReader,
  EntityFeedDeclaration,
  MediaAttachmentContext,
  MediaEntityListRequest,
  MediaEntityReads,
  MediaEntityRequest,
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

/**
 * Which route a create request takes, by how the caller expressed it: an
 * upload or attachment reference first, then content, then a prompt. A
 * conversation message arrives as content.
 */
function selectCreateRoute(
  routing: EntityCreateRouting,
  input: CreateInput,
): EntityCreateRoute | undefined {
  switch (input.from?.kind) {
    case "entity-attachment":
      return routing.fromAttachment;
    case "upload":
      return routing.fromUpload;
    default:
      if (input.content) return routing.fromContent;
      return input.prompt ? routing.fromPrompt : undefined;
  }
}

/** A detached copy no route can change under the runtime. */
function deepFrozen<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFrozen);
    Object.freeze(value);
  }
  return value;
}

/** Who a create is attributed to in the store. */
function eventContextOf(executionContext: CreateExecutionContext): {
  readonly actor: CreateExecutionContext["actor"];
  readonly interfaceType: string;
} {
  return {
    actor: executionContext.actor,
    interfaceType: executionContext.interfaceType,
  };
}

/**
 * A queued job's attribution to the caller who asked for it, as the entity
 * plugin classes queued their own jobs.
 */
function attributionJobOptions(
  source: string,
  executionContext: CreateExecutionContext,
): JobOptions {
  return {
    source,
    metadata: {
      operationType: "content_operations",
      interfaceType: executionContext.interfaceType,
      requestedByActor: executionContext.actor,
      ...(executionContext.actor.kind === "user"
        ? { requestedByUserId: executionContext.actor.userId }
        : {}),
      requestedByInterface: executionContext.interfaceType,
    },
  };
}

function createFailure(error: string): CreateResult {
  return { success: false, error };
}

/**
 * Public reads for a media provider. Each request is rebuilt from the fields
 * the contract names, so nothing a provider passes can widen visibility.
 */
function mediaEntityReads(
  entityService: EntityPluginContext["entityService"],
): MediaEntityReads {
  function getEntity(request: MediaEntityRequest): Promise<BaseEntity | null>;
  function getEntity<T extends BaseEntity>(
    request: MediaEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  function getEntity<T extends BaseEntity>(
    request: MediaEntityRequest,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity | T | null> {
    const read = { entityType: request.entityType, id: request.id };
    return schema
      ? entityService.getEntity(read, schema)
      : entityService.getEntity(read);
  }
  function listEntities(request: MediaEntityListRequest): Promise<BaseEntity[]>;
  function listEntities<T extends BaseEntity>(
    request: MediaEntityListRequest,
    schema: EntitySchema<T>,
  ): Promise<T[]>;
  function listEntities<T extends BaseEntity>(
    request: MediaEntityListRequest,
    schema?: EntitySchema<T>,
  ): Promise<BaseEntity[] | T[]> {
    const read = {
      entityType: request.entityType,
      options: definedFields({ limit: request.options?.limit }),
    };
    return schema
      ? entityService.listEntities(read, schema)
      : entityService.listEntities(read);
  }
  return Object.freeze({ getEntity, listEntities });
}

/** The media members an attachment provider is built with, frozen and bound. */
function mediaAttachmentContext(
  context: EntityPluginContext,
): MediaAttachmentContext {
  const { identity, views } = context;
  return Object.freeze({
    domain: context.domain,
    themeCSS: context.themeCSS,
    identity: Object.freeze({ getProfile: () => identity.getProfile() }),
    entityService: mediaEntityReads(context.entityService),
    views: Object.freeze({ get: (name: string) => views.get(name) }),
  });
}

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
  return definition.markdown?.encode
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

type DeclaredAdapter = EntityAdapter<
  EntityOf<AnyEntityDefinition>,
  Record<string, unknown>
>;

/** How a text type's record is its markdown: its metadata is its frontmatter. */
function markdownStorage(
  definition: AnyEntityDefinition,
): Pick<
  DeclaredAdapter,
  | "frontmatterSchema"
  | "toMarkdown"
  | "fromMarkdown"
  | "parseFrontMatter"
  | "generateFrontMatter"
  | "metadataFromFrontmatter"
> {
  return {
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
    parseFrontMatter: (markdown, schemaToParse) =>
      parseMarkdownWithFrontmatter(markdown, schemaToParse).metadata,
    generateFrontMatter(entity): string {
      return generateFrontmatter(encodeParts(definition, entity).frontmatter);
    },
    // Metadata is the frontmatter, decoded by fromMarkdown, so a frontmatter
    // write on an update carries into metadata.
    metadataFromFrontmatter: true,
  };
}

/**
 * How a binary type's record is its content: stored unchanged, with no
 * frontmatter, its metadata kept beside it. Decoding says what the bytes
 * say, which an import merges with the metadata handed beside the file; the
 * schema checks the record when it is stored.
 */
function binaryStorage(
  definition: AnyEntityDefinition,
): Pick<
  DeclaredAdapter,
  "toMarkdown" | "fromMarkdown" | "parseFrontMatter" | "generateFrontMatter"
> {
  return {
    toMarkdown: (entity): string => entity.content,
    fromMarkdown(content): Partial<EntityOf<AnyEntityDefinition>> {
      const decoded = definition.markdown?.decode({ content, frontmatter: {} });
      const entityType = definition.type;
      if (!decoded) return { entityType, content };
      // Bytes that say nothing leave the metadata to what is handed beside
      // them, as an adapter that recovers none returns none.
      const said = { ...decoded.metadata };
      return Object.keys(said).length > 0
        ? { entityType, content: decoded.content, metadata: said }
        : { entityType, content: decoded.content };
    },
    parseFrontMatter: (_content, schemaToParse) => schemaToParse.parse({}),
    generateFrontMatter: (): string => "",
  };
}

function entityAdapter(definition: AnyEntityDefinition): DeclaredAdapter {
  const schema = entitySchema(definition);
  const stub = definition.stub;
  return {
    entityType: definition.type,
    purpose: definition.purpose,
    schema,
    ...(definition.config?.binaryStorage === undefined
      ? markdownStorage(definition)
      : binaryStorage(definition)),
    extractMetadata: (entity) => entity.metadata,
    getBodyTemplate: () => "",
    // Left off when undeclared: system_generate reads its absence as "this
    // type does not support queued generation" and says so.
    ...(stub && {
      buildStub: (input: {
        id: string;
        title: string;
      }): { content: string; metadata: Record<string, unknown> } => {
        const built = stub(input);
        return { content: built.content, metadata: { ...built.metadata } };
      },
    }),
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
        // A derived entry is as private as what it was derived from, unless
        // the projection says otherwise.
        const visibility = entity.visibility ?? source.visibility;
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

type BoundEntityWidget = EntityDashboardWidget &
  BoundDashboardWidget<
    AnyDashboardWidgetDefinition,
    Readonly<Record<string, never>>,
    Readonly<Record<string, never>>,
    undefined
  >;

function isBoundEntityWidget(
  widget: EntityDashboardWidget,
): widget is BoundEntityWidget {
  return (
    "load" in widget &&
    typeof widget.load === "function" &&
    "view" in widget.definition &&
    typeof widget.definition.view === "function"
  );
}

/** Entity types have no config, state or settings to bind widgets to. */
const entityDashboardBinding: EntityDashboardBindingContext = Object.freeze({
  config: Object.freeze({}),
  state: Object.freeze({}),
  accountSettings: undefined,
});

function boundProjectionInput(
  context: ProjectionInputContext,
): ProjectionInputContext {
  const entities = context.entities;
  return Object.freeze({
    entities: Object.freeze({
      getEntity: entities.getEntity.bind(entities),
      listEntities: entities.listEntities.bind(entities),
      getEntityTypes: entities.getEntityTypes.bind(entities),
      hasEntityType: entities.hasEntityType.bind(entities),
      getEntityTypeConfig: entities.getEntityTypeConfig.bind(entities),
      isProjectionOwnedEntity: entities.isProjectionOwnedEntity.bind(entities),
    }),
    resolvePrompt: context.resolvePrompt.bind(context),
    appInfo: context.appInfo.bind(context),
    identityInput: context.identityInput.bind(context),
  });
}

function boundProjectionExecution(
  context: ProjectionExecutionContext,
): ProjectionExecutionContext {
  const ai = context.ai;
  return Object.freeze({
    ai: Object.freeze({
      generate: ai.generate.bind(ai),
      generateObject: ai.generateObject.bind(ai),
    }),
    logger: context.logger,
  });
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
          // The source is a type of the projection's own package, read as
          // the package reads its own types; what it derives keeps the
          // source's visibility.
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
  private readonly create: EntityCreateRouting | undefined;
  private readonly attachments: AnyEntityDefinition["attachments"];
  private readonly jobs: Readonly<Record<string, AnyEntityJobDeclaration>>;
  private readonly generation: AnyEntityDefinition["generation"];
  private readonly projectionRules: readonly ProjectionRule[];
  /** The types the declaring package owns: its own, when it acts as itself. */
  private readonly packageTypes: ReadonlySet<string>;
  private permissions: PermissionService | undefined;
  private releases: readonly (() => void)[] = [];
  private readonly dashboardWidgetIds: string[] = [];
  private readonly widgetAbort: AbortController = new AbortController();
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
    packageTypes: ReadonlySet<string>,
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
    this.packageTypes = packageTypes;
    if (definition.feed) feedPathSchema.parse(definition.feed.path);
    this.feed = definition.feed;
    this.definition = definition;
    this.create = definition.create;
    this.attachments = definition.attachments;
    this.jobs = definition.jobs ?? {};
    this.generation = definition.generation;
    this.entityType = definition.type;
    this.schema = entitySchema(definition);
    this.adapter = entityAdapter(definition);
    const declared = definition.projectionRules;
    this.projectionRules = (
      typeof declared === "function"
        ? declared({ template: (localName) => this.templateName(localName) })
        : (declared ?? [])
    ).map((rule) => this.declaredProjectionRule(rule));
  }

  /**
   * A declared rule as the runtime runs it: it writes this type only, and it
   * is handed bound reads and generation, never the services behind them.
   */
  private declaredProjectionRule(rule: ProjectionRule): ProjectionRule {
    if (rule.targetType !== this.entityType) {
      throw new Error(
        `Projection rule "${rule.id}" on ${this.entityType} writes ${rule.targetType}`,
      );
    }
    return Object.freeze({
      ...rule,
      selectInput: (
        trigger: Parameters<ProjectionRule["selectInput"]>[0],
        context: ProjectionInputContext,
        signal: AbortSignal,
      ): ReturnType<ProjectionRule["selectInput"]> =>
        rule.selectInput(trigger, boundProjectionInput(context), signal),
      derive: (
        input: Parameters<ProjectionRule["derive"]>[0],
        context: ProjectionExecutionContext,
        signal: AbortSignal,
      ): ReturnType<ProjectionRule["derive"]> =>
        rule.derive(input, boundProjectionExecution(context), signal),
    });
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return this.entityTypeConfig;
  }

  /** The registered name of a template this type declares. */
  private templateName(localName: string): string {
    if (!Object.hasOwn(this.templates ?? {}, localName)) {
      throw new Error(
        `${this.entityType} declares no template named "${localName}"`,
      );
    }
    return `${this.id}:${localName}`;
  }

  /** Whether a type is one the declaring package owns. */
  private ownsType(entityType: string): boolean {
    return this.packageTypes.has(entityType);
  }

  /**
   * Reads for the package acting as itself, with no caller behind it: its
   * own types at every visibility, other types at its grant, which is public
   * unless the brain grants this plugin more.
   */
  private asPackage(context: EntityPluginContext): EntityReader {
    const self = packageSelfCall(context.jobAuthority);
    return createPackageEntityReader(
      context.entityService,
      () => self,
      (entityType) => this.ownsType(entityType),
    );
  }

  private generationHandler(
    context: EntityPluginContext,
    declaration: NonNullable<AnyEntityDefinition["generation"]>,
    jobTypeName: string,
    reportsToPipeline = false,
  ): DeclarativeGenerationHandler {
    return new DeclarativeGenerationHandler(this.logger, context, declaration, {
      entityType: this.entityType,
      jobTypeName,
      template: (localName) => this.templateName(localName),
      ownsType: (entityType) => this.ownsType(entityType),
      retries: this.retries,
      reportsToPipeline,
    });
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return this.definition.instructions;
  }

  /**
   * Answer the content pipeline's schedule for this type: list the material
   * the declaration names, pick from it, and queue this type's generation.
   * Nothing to write from is reported back rather than thrown.
   */
  private async runScheduledGeneration(
    context: EntityPluginContext,
    scheduled: NonNullable<AnyEntityDefinition["scheduledGeneration"]>,
  ): Promise<void> {
    const reportFailure = (error: string): Promise<void> =>
      context.messaging.command(generateReportFailureContract, {
        entityType: this.entityType,
        error,
      });
    try {
      // The package starts this run, so it reads as itself, at its own
      // grant: its own types at every visibility, others as the grant allows.
      const self = packageSelfCall(context.jobAuthority);
      const access = await self.access();
      const scope = (entityType: string): ContentVisibility =>
        packageReadScope(self, this.ownsType(entityType), access);
      const sources = await context.entityService.listEntities({
        entityType: scheduled.from.entityType,
        options: {
          limit: scheduled.from.limit,
          filter: {
            visibilityScope: scope(scheduled.from.entityType),
            ...(scheduled.from.status !== undefined && {
              metadata: { status: scheduled.from.status },
            }),
          },
        },
      });
      const data = await this.scheduledInput(
        context,
        scheduled,
        sources.map(({ id }) => id),
        scope(this.entityType),
      );
      if (!data) {
        await reportFailure(
          `No ${[scheduled.from.status, scheduled.from.entityType]
            .filter(Boolean)
            .join(" ")} available to write a ${this.entityType} from`,
        );
        return;
      }
      // Queued as the package, so the generation runs as the package too,
      // with the entries it is written from beside its input.
      const queued = {
        ...(await admitPackageJob(context.jobAuthority, undefined, data)),
        ...definedFields({ source: generationSource(data) }),
      };
      // A refused enqueue is retried until the queue admits it; the
      // schedule does not come again until its next cycle.
      await this.retries.run(
        () =>
          context.jobs.enqueue({
            type: `${this.entityType}:generation`,
            data: queued,
            toolContext: {
              interfaceType: "job",
              actor: { kind: "service", serviceId: this.id },
            },
          }),
        `queue a scheduled ${this.entityType} generation`,
        `generate:${this.entityType}`,
      );
    } catch (error) {
      await reportFailure(getErrorMessage(error));
    }
  }

  /** The generation input for a schedule, or null when nothing qualifies. */
  private async scheduledInput(
    context: EntityPluginContext,
    scheduled: NonNullable<AnyEntityDefinition["scheduledGeneration"]>,
    sourceIds: readonly string[],
    visibilityScope: ContentVisibility,
  ): Promise<Record<string, unknown> | null> {
    if (sourceIds.length === 0) return null;
    const sourceEntityType = scheduled.from.entityType;
    if (scheduled.mode === "batch") {
      return { sourceEntityType, sourceEntityIds: [...sourceIds] };
    }
    // One at a time: a source this type was already written from — named
    // in its sourceEntityType/sourceEntityId metadata — is skipped.
    const derived = await Promise.all(
      sourceIds.map((sourceEntityId) =>
        context.entityService.listEntities({
          entityType: this.entityType,
          options: {
            filter: {
              visibilityScope,
              metadata: { sourceEntityType, sourceEntityId },
            },
            limit: 1,
          },
        }),
      ),
    );
    const sourceEntityId = sourceIds.find(
      (_id, index) => derived[index]?.length === 0,
    );
    return sourceEntityId ? { sourceEntityType, sourceEntityId } : null;
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return this.generation
      ? this.generationHandler(
          context,
          this.generation,
          `${this.entityType}:generation`,
          this.definition.scheduledGeneration !== undefined,
        )
      : null;
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

  /** The brain's action policy, read when a job writes. */
  private requiredLevel(
    entityType: string,
    action: "create" | "update" | "delete",
  ): EntityActionRequiredLevel | undefined {
    if (!this.permissions) {
      throw new Error(`Entity type "${this.entityType}" is not registered`);
    }
    return this.permissions.getEntityActionRequiredLevel(entityType, action);
  }

  override async register(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    this.permissions = shell.getPermissionService();
    return super.register(shell, registrationContext);
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

    // Local names: the jobs namespace scopes each to this type's plugin.
    Object.entries(this.jobs).forEach(([name, declaration]) => {
      const writes: EntityJobWrites = {
        declaring: this.definition,
        requiredLevel: (entityType, action) =>
          this.requiredLevel(entityType, action),
      };
      const ownsType = (entityType: string): boolean =>
        this.ownsType(entityType);
      const contract = contractJobOf(declaration);
      if (contract) {
        // Other packages queue it by its contract's type, so the name it
        // is registered under must scope to exactly that.
        if (contract.type !== `${this.id}:${name}`) {
          throw new Error(
            `Job "${name}" of ${this.entityType} answers "${contract.type}" but is declared as "${this.id}:${name}"`,
          );
        }
        if ("generate" in declaration) {
          throw new Error(
            `Contract job "${contract.type}" handles its own work`,
          );
        }
        context.jobs.registerHandler(
          name,
          contractJobHandler(declaration, context, ownsType, writes, this.id),
        );
        return;
      }
      context.jobs.registerHandler(
        name,
        "generate" in declaration
          ? this.generationHandler(context, declaration, name)
          : entityJobHandler(declaration, context, ownsType, writes),
      );
    });

    // system_generate queues this type's generation through here, so the
    // job carries the authority of the caller who asked for it.
    if (this.generation) {
      const generationType = `${this.entityType}:generation`;
      context.entities.registerGenerationEnqueuer(
        this.entityType,
        async (data, toolContext): Promise<string> => {
          const { entityId, ...input } = data;
          const queued = await admitPackageJob(
            context.jobAuthority,
            toolCaller(toolContext),
            input,
          );
          return context.jobs.enqueue({
            type: generationType,
            data: {
              ...queued,
              ...(typeof entityId === "string" && { entityId }),
              ...definedFields({ source: generationSource(data) }),
            },
            toolContext,
          });
        },
      );
    }

    const create = this.create;
    if (create) this.registerCreateRouting(context, create);

    // Evals run with no caller, so as the package, with fixtures scoped to
    // this type.
    Object.entries(this.definition.evals ?? {}).forEach(([id, handler]) => {
      context.eval.registerHandler(id, (input) =>
        handler(
          input,
          withEntityRuntime(
            {
              ai: createGenerationAI(context, (localName) =>
                this.templateName(localName),
              ),
              entities: this.asPackage(context),
              fixtures: createEvalFixtures(context, this.entityType),
            },
            // An eval runs with no caller, so its searches read as the
            // package.
            this.runtimeBinding(context, this.asPackage(context), "an eval"),
          ),
        ),
      );
    });

    const agentContext = this.definition.agentContext;
    const scheduled = this.definition.scheduledGeneration;

    const seed = this.seed;
    const feed = this.feed;
    const atproto = this.definition.atproto;
    const publish = this.definition.publish;
    const publishAssets = this.definition.publishAssets ?? [];
    // Registered through the plugin's scoped analytics, which removes them
    // when the plugin goes.
    for (const declared of this.definition.analyticsReports ?? []) {
      context.analytics.register({
        type: declared.type,
        description: declared.description,
        params: declared.params,
        ...definedFields({ minVisibility: declared.minVisibility }),
        handler: (params, { entityService, visibilityScope }) =>
          declared.report(
            params,
            Object.freeze({
              entities: createEntityReader(entityService, visibilityScope),
              visibility: visibilityScope,
            }),
          ),
      });
    }
    const widgets = (
      this.definition.dashboardWidgets?.(entityDashboardBinding) ?? []
    ).map((widget) => this.boundWidget(widget));
    const widgetIds = widgets.map(({ definition }) => definition.id);
    const repeated = widgetIds.find(
      (id, index) => widgetIds.indexOf(id) !== index,
    );
    if (repeated) {
      throw new Error(
        `${this.entityType} binds dashboard widget "${repeated}" twice`,
      );
    }
    // The shell removes a plugin's Inbox sources with the plugin.
    const inbox = this.definition.inbox;
    if (inbox) context.inbox.registerSource(this.inboxSource(context, inbox));
    const media = this.attachments?.length
      ? mediaAttachmentContext(context)
      : undefined;
    this.releases = [
      ...(agentContext
        ? [
            // Reads are scoped to the asker, so a provider cannot surface
            // restricted records into a public conversation.
            context.messaging.answer(agentContextContract, async (request) => ({
              items: [
                ...(await agentContext(
                  Object.freeze({
                    request: deepFrozen(structuredClone(request)),
                    entities: createEntityReader(
                      context.entityService,
                      permissionToVisibilityScope(request.userPermissionLevel),
                    ),
                  }),
                )),
              ],
            })),
          ]
        : []),
      ...(scheduled
        ? [
            context.messaging.answer(
              generateExecuteContract,
              async ({ entityType }) => {
                if (entityType === this.entityType) {
                  await this.runScheduledGeneration(context, scheduled);
                }
              },
            ),
          ]
        : []),
      // The runtime keeps the unregister handles, so an author never does.
      ...(this.attachments ?? []).flatMap((attachment) =>
        media
          ? [
              context.attachments.register(
                this.entityType,
                attachment.type,
                attachment.provider(media),
              ),
            ]
          : [],
      ),
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
      // The service scopes each check id to this plugin and hands back the
      // release.
      ...(this.definition.checks ?? []).map((check) =>
        context.recurringChecks.register({
          id: check.id,
          cadence: check.cadence,
          ...definedFields({
            deliverAlerts: check.deliverAlerts,
            includeInInbox: check.includeInInbox,
          }),
          run: ({ signal }) =>
            check.run(
              Object.freeze({
                // A scheduled run has no caller: it reads as the package.
                entities: this.asPackage(context),
                siteUrl: context.siteUrl,
                signal,
              }),
            ),
        }),
      ),
      ...(atproto
        ? [
            context.atprotoProjections.register(
              this.atprotoProjection(context, atproto),
            ),
          ]
        : []),
      ...(widgets.length > 0
        ? [
            // The Dashboard answers registrations once every plugin is in.
            context.messaging.subscribe(
              SYSTEM_CHANNELS.pluginsRegistered,
              async (): Promise<{ success: true }> => {
                await this.registerDashboardWidgets(context, widgets);
                return { success: true };
              },
            ),
          ]
        : []),
      ...(publish || publishAssets.length > 0
        ? [
            // Announced once every plugin is registered, so the publish
            // pipeline is listening whichever order the plugins load in.
            context.messaging.subscribe(
              SYSTEM_CHANNELS.pluginsRegistered,
              async (): Promise<{ success: true }> => {
                if (publish) {
                  await context.messaging.command(publishRegisterContract, {
                    entityType: this.entityType,
                    provider: publish.provider,
                    config: {
                      executionMode: "provider",
                      ...definedFields({
                        publishResultIdField: publish.resultIdField,
                        publishTimestampField: publish.timestampField,
                      }),
                    },
                  });
                }
                for (const asset of publishAssets) {
                  await context.messaging.command(
                    publishAssetRegisterContract,
                    {
                      entityType: this.entityType,
                      attachmentType: asset.attachmentType,
                      mediaEntityType: "image",
                      // The image job records the id in the frontmatter the
                      // stored record carries.
                      targetEntityField: {
                        location: "frontmatter",
                        field: asset.field,
                      },
                      ...definedFields({ requiredWhen: asset.requiredWhen }),
                      autoGenerate: true,
                    },
                  );
                }
                return { success: true };
              },
            ),
          ]
        : []),
    ];
  }

  private async registerDashboardWidgets(
    context: EntityPluginContext,
    widgets: readonly BoundEntityWidget[],
  ): Promise<void> {
    if (context.executionOnly || !context.dashboard.isAvailable()) return;
    for (const binding of widgets) {
      const registered = await context.dashboard.registerWidget(
        createDeclarativeDashboardWidgetRegistration({
          publicServiceId: this.id,
          packageName: this.packageName,
          config: entityDashboardBinding.config,
          state: entityDashboardBinding.state,
          binding,
          context,
          runtimeSignal: this.widgetAbort.signal,
        }),
      );
      if (registered) this.dashboardWidgetIds.push(binding.definition.id);
    }
  }

  /**
   * The binding a declared widget is: a definition's `bind` made it, and it
   * carries the loader the Dashboard calls.
   */
  private boundWidget(widget: EntityDashboardWidget): BoundEntityWidget {
    if (isBoundEntityWidget(widget)) return widget;
    throw new Error(
      `${this.entityType} dashboard widget "${widget.definition.id}" is not bound; bind it with defineDashboardWidget(...).bind(context, load)`,
    );
  }

  /** Reads of the declaring type alone, up to one visibility. */
  private records(
    context: EntityPluginContext,
    visibilityScope: ContentVisibility,
  ): EntityRecordReader<EntityOf<AnyEntityDefinition>> {
    const definition = this.definition;
    const reader = createEntityReader(context.entityService, visibilityScope);
    return Object.freeze({
      get: (id: string): Promise<EntityOf<AnyEntityDefinition> | null> =>
        reader.get(definition, id),
      list: (
        options?: DataSourceListOptions,
      ): Promise<readonly EntityOf<AnyEntityDefinition>[]> =>
        reader.list(definition, options),
    });
  }

  /**
   * The declared Inbox in the shape the Inbox reads. Listing reads as the
   * package; opening and acting read as the actor, and acting writes only
   * through edits the actor is allowed.
   */
  private inboxSource(
    context: EntityPluginContext,
    declared: EntityInboxDeclaration,
  ): InboxSource {
    // The declaring type is the package's own, so it lists at every visibility.
    const full = internalFullScope("the declared Inbox lists as its package");
    const asActor = (
      actor: InboxActor,
    ): Omit<EntityInboxActionContext<AnyEntityDefinition>, "edits"> => {
      const scope = permissionToVisibilityScope(actor.permissionLevel);
      return {
        actor,
        records: this.records(context, scope),
        entities: createEntityReader(context.entityService, scope),
      };
    };
    const resolveDetail = declared.resolveDetail?.bind(declared);
    return {
      sourceId: declared.sourceId,
      displayName: declared.displayName,
      ...(declared.facets ? { facets: [...declared.facets] } : {}),
      // The listing is gathered for every operator at once, with no viewer
      // behind it, so it reads as the package: its own types at every
      // visibility, other types at its grant.
      list: async (): Promise<InboxItem[]> => [
        ...(await declared.list(
          Object.freeze({
            records: this.records(context, full),
            entities: this.asPackage(context),
          }),
        )),
      ],
      ...(resolveDetail && {
        resolveDetail: (
          itemId: string,
          actor: InboxActor,
          signal: AbortSignal,
        ): Promise<InboxItemDetail> =>
          resolveDetail(itemId, Object.freeze({ ...asActor(actor), signal })),
      }),
      act: (itemId: string, actionId: string, actor: InboxActor) =>
        declared.act(
          itemId,
          actionId,
          Object.freeze({
            ...asActor(actor),
            edits: this.inboxEdits(context, actor),
          }),
        ),
    };
  }

  private inboxEdits(
    context: EntityPluginContext,
    actor: InboxActor,
  ): EntityInboxEdits<AnyEntityDefinition> {
    const entityType = this.entityType;
    const allow = (action: "update" | "publish" | "delete"): void =>
      context.permissions.assertEntityActionAllowed(entityType, action, {
        userPermissionLevel: actor.permissionLevel,
      });
    const own = (record: EntityOf<AnyEntityDefinition>): void => {
      if (record.entityType !== entityType) {
        throw new Error(
          `An Inbox action on ${entityType} cannot write ${record.entityType}`,
        );
      }
    };
    const changed = (): Error =>
      new Error(`The ${entityType} changed meanwhile; try again`);
    const write = async (
      record: EntityOf<AnyEntityDefinition>,
      change: EntityInboxChange<AnyEntityDefinition>,
      action: "update" | "publish",
    ): Promise<void> => {
      allow(action);
      own(record);
      const result = await context.entityService.updateEntity({
        entity: {
          ...record,
          content: change.content ?? record.content,
          metadata: this.definition.metadata.parse(
            change.metadata ?? record.metadata,
          ),
        },
        options: { expectedContentHash: record.contentHash },
      });
      if (!result.skipped) return;
      // Skipped is either an identical write or a stale one; only the
      // second means the operator acted on something they did not see.
      const current = await context.entityService.getEntity({
        entityType,
        id: record.id,
        visibilityScope: internalFullScope("an Inbox write checks its read"),
      });
      if (current?.contentHash !== record.contentHash) throw changed();
    };
    return Object.freeze({
      update: (
        record: EntityOf<AnyEntityDefinition>,
        change: EntityInboxChange<AnyEntityDefinition>,
      ): Promise<void> => write(record, change, "update"),
      publish: (
        record: EntityOf<AnyEntityDefinition>,
        change: EntityInboxChange<AnyEntityDefinition>,
      ): Promise<void> => write(record, change, "publish"),
      delete: async (record: EntityOf<AnyEntityDefinition>): Promise<void> => {
        allow("delete");
        own(record);
        const deleted = await context.entityService.deleteEntity({
          entityType,
          id: record.id,
          options: { expectedContentHash: record.contentHash },
        });
        if (!deleted) throw changed();
      },
    });
  }

  /**
   * The declared projection in the shape the AT Protocol service reads. It
   * reads through its own reader rather than the context the service passes,
   * and it is given the validated record.
   */
  private atprotoProjection(
    context: EntityPluginContext,
    declared: EntityAtprotoProjection<EntityOf<AnyEntityDefinition>>,
  ): AtprotoProjection {
    const definition = this.definition;
    // The record is published to a public PDS, so it is built from public
    // entries only, as the class-based blog projection builds its own.
    const entities = createEntityReader(context.entityService, "public");
    const isPublishable = declared.isPublishable?.bind(declared);
    return {
      entityType: this.entityType,
      collection: declared.lexicon.id,
      lexicon: declared.lexicon,
      ...definedFields({ validate: declared.validate }),
      ...(isPublishable && {
        // An invalid record stays publishable so its build fails and is
        // reported, instead of the published record being withdrawn.
        isPublishable: (entity: BaseEntity): boolean => {
          const parsed = entitySchema(definition).safeParse(entity);
          return parsed.success ? isPublishable(parsed.data) : true;
        },
      }),
      // Async, so a record that does not validate rejects rather than throws.
      buildRecord: async ({
        entity,
        config,
        client,
        pageUrl,
        topics,
        dryRun,
      }: AtprotoProjectionBuildInput): Promise<Record<string, unknown>> =>
        declared.buildRecord(
          Object.freeze({
            entity: parseDefinitionEntity(definition, entity),
            config: Object.freeze(
              definedFields({
                brainDid: config.brainDid,
                anchorDid: config.anchorDid,
              }),
            ),
            ...definedFields({
              pageUrl,
              topics: topics && Object.freeze([...topics]),
            }),
            dryRun: dryRun === true,
            entities,
            uploadBlob: async ({
              data,
              mimeType,
            }: {
              readonly data: Uint8Array;
              readonly mimeType: string;
            }): Promise<AtprotoBlobRef> => {
              if (dryRun) {
                return {
                  $type: "blob",
                  ref: { $link: "dry-run" },
                  mimeType,
                  size: data.byteLength,
                };
              }
              if (!client?.uploadBlob) {
                throw new Error(
                  "AT Protocol PDS client does not support blob uploads",
                );
              }
              return (await client.uploadBlob({ data, mimeType })).blob;
            },
          }),
        ),
    };
  }

  private registerCreateRouting(
    context: EntityPluginContext,
    routing: EntityCreateRouting,
  ): void {
    const interceptCreate: CreateInterceptor = (input, executionContext) =>
      this.routeCreate(context, routing, input, executionContext);
    context.entities.registerCreateInterceptor(
      this.entityType,
      interceptCreate,
    );
    // Checked before the user confirms, through the route the confirmed
    // create will take; a rejecting route says so before anyone is asked.
    context.entities.registerCreateCheck(
      this.entityType,
      async (input, executionContext): Promise<CreateCheckResult> => {
        const route = selectCreateRoute(routing, input);
        if (!route) return { kind: "ready" };
        if ("reject" in route) return { kind: "error", error: route.reject };
        return route.check
          ? route.check(this.createContext(context, input, executionContext))
          : { kind: "ready" };
      },
    );
    // The upload endpoint routes by media type into the same route, rather
    // than a second handler re-implementing the create.
    const mediaTypes = routing.fromUpload?.mediaTypes ?? [];
    if (mediaTypes.length > 0) {
      context.entities.registerUploadSaveHandler({
        entityType: this.entityType,
        mediaTypes: [...mediaTypes],
        handler: createUploadSaveHandler(
          this.entityType,
          interceptCreate,
          `Upload was not handled by ${this.entityType}`,
        ),
      });
    }
  }

  private async routeCreate(
    context: EntityPluginContext,
    routing: EntityCreateRouting,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateInterceptionResult> {
    const route = selectCreateRoute(routing, input);
    if (!route) return { kind: "continue", input };
    if ("reject" in route) {
      return { kind: "handled", result: createFailure(route.reject) };
    }
    const resolution = await route.resolve(
      this.createContext(context, input, executionContext),
    );
    // A first-party route handing on to the ordinary create, which system
    // create performs at the caller's authority.
    const ordinary = ordinaryCreateOf(resolution);
    if (ordinary) {
      const { targetEntityId } = ordinary.options;
      const targeted: CreateInput = {
        ...input,
        ...(targetEntityId !== undefined && { targetEntityId }),
      };
      if (!ordinary.document) return { kind: "continue", input: targeted };
      const { fields: _folded, ...request } = targeted;
      const { title, content, fields } = ordinary.document;
      return {
        kind: "continue",
        input: {
          ...request,
          ...(title !== undefined && { title }),
          content,
          ...(fields !== undefined && { fields: { ...fields } }),
        },
      };
    }
    // First-party routes that queue a contract job, or store a complete
    // record, as an entity plugin's interceptor did.
    const queued = queuedCreateOf(resolution);
    if (queued) {
      return {
        kind: "handled",
        result: await this.applyQueuedCreate(
          context,
          queued,
          input,
          executionContext,
        ),
      };
    }
    const stored = storedCreateOf(resolution);
    if (stored) {
      return {
        kind: "handled",
        result: await this.applyStoredCreate(
          context,
          stored,
          input,
          executionContext,
        ),
      };
    }
    return {
      kind: "handled",
      result: await this.applyCreateResolution(
        context,
        resolution,
        input,
        executionContext,
      ),
    };
  }

  /** What a route decides with: frozen, read-only, at the caller's level. */
  private createContext(
    context: EntityPluginContext,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): EntityCreateContext {
    const uploads = context.uploads.scoped(sharedUploadScope);
    const reader: EntityCreateUploadReader = Object.freeze({
      read: (uploadId: string) => uploads.read(uploadId),
      readRecord: (uploadId: string) => uploads.readRecord(uploadId),
    });
    const entities = createEntityReader(
      context.entityService,
      this.callerScope(executionContext),
    );
    return withEntityRuntime(
      {
        input: deepFrozen(structuredClone(input)),
        entities,
        uploads: reader,
      },
      this.runtimeBinding(context, entities, "a create route", {
        // Targets and sources are read public, as the entity plugin
        // classes' create interceptors read them.
        service: context.entityService,
        scope: () => "public",
      }),
    );
  }

  /**
   * The internal runtime a first-party definition reaches through
   * entityRuntime(context): searches at the call's visibility, reads of the
   * package's own types as the package, and free-form structured AI.
   */
  private runtimeBinding(
    context: EntityPluginContext,
    reader: EntityReader,
    where: string,
    anyEntities?: AnyEntityBinding,
  ): EntityRuntimeBinding {
    return {
      where,
      reader,
      ...(anyEntities && { anyEntities }),
      packageReader: this.asPackage(context),
      ownsType: (entityType) => this.ownsType(entityType),
      searchWithDistances: (request) =>
        context.entityService.searchWithDistances(request),
      generateObject: (prompt, schema) =>
        context.ai.generateObject(prompt, schema),
    };
  }

  private callerScope(
    executionContext: CreateExecutionContext,
  ): ContentVisibility {
    return permissionToVisibilityScope(executionContext.userPermissionLevel);
  }

  /**
   * Perform what a route decided. The runtime writes, so "created" and
   * "updated" describe what it did rather than what the route claims.
   */
  private async applyCreateResolution(
    context: EntityPluginContext,
    resolution: EntityCreateResolution | EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    if ("delegate" in resolution) {
      return this.applyDelegation(context, resolution, input, executionContext);
    }
    if ("refuse" in resolution) return createFailure(resolution.refuse);
    const visibilityScope = this.callerScope(executionContext);
    const eventContext = {
      actor: executionContext.actor,
      interfaceType: executionContext.interfaceType,
    };

    if ("existing" in resolution) {
      const found = await context.entityService.getEntity({
        entityType: this.entityType,
        id: resolution.existing.id,
        visibilityScope,
      });
      if (!found) {
        return createFailure(
          `Cannot reuse ${this.entityType} "${resolution.existing.id}", which does not exist`,
        );
      }
      return this.createSuccess("existing", found.id, resolution.attachment);
    }

    const target =
      "update" in resolution ? resolution.update : resolution.create;
    const metadata = this.definition.metadata.safeParse(target.metadata);
    if (!metadata.success) return createFailure(this.invalid(metadata.error));

    if ("update" in resolution) {
      const existing = await context.entityService.getEntity({
        entityType: this.entityType,
        id: resolution.update.id,
        visibilityScope,
      });
      if (!existing) {
        return createFailure(
          `Cannot update ${this.entityType} "${resolution.update.id}", which does not exist`,
        );
      }
      const written = await context.entityService.updateEntity({
        entity: {
          ...existing,
          content: resolution.update.content,
          metadata: metadata.data,
        },
        options: { eventContext },
      });
      return this.createSuccess("updated", written.entityId, undefined);
    }

    // Create-if-absent: a route that did not see an entity at the caller's
    // level must not write over one it could not see.
    const taken = await context.entityService.getEntity({
      entityType: this.entityType,
      id: resolution.create.id,
      visibilityScope: internalFullScope(
        "create route checks whether its id is taken; no content returned",
      ),
    });
    const alreadyExists = `A ${this.entityType} "${resolution.create.id}" already exists`;
    if (taken) return createFailure(alreadyExists);
    try {
      const written = await context.entityService.createEntity({
        entity: {
          id: resolution.create.id,
          entityType: this.entityType,
          content: resolution.create.content,
          metadata: metadata.data,
          ...(input.visibility !== undefined && {
            visibility: input.visibility,
          }),
        },
        options: {
          conditionalWrite: { expectedRevision: null },
          eventContext,
        },
      });
      return this.createSuccess(
        "created",
        written.entityId,
        resolution.attachment,
      );
    } catch (error) {
      if (error instanceof EntityWriteConflictError) {
        return createFailure(alreadyExists);
      }
      throw error;
    }
  }

  private invalid(error: z.ZodError): string {
    return `Invalid ${this.entityType} metadata: ${error.issues
      .map(({ path, message }) => `${path.join(".") || "metadata"}: ${message}`)
      .join("; ")}`;
  }

  /**
   * Allocate now and finish later: write the placeholder (or find the
   * entity), then queue the declared job with its id. Everything the
   * delegation needs is checked before anything is written.
   */
  private async applyDelegation(
    context: EntityPluginContext,
    allocation: EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const { job: name, input: jobInput = {} } = allocation.delegate;
    const job = Object.hasOwn(this.jobs, name) ? this.jobs[name] : undefined;
    if (!job) {
      return createFailure(
        `${this.entityType} declares no job named "${name}"`,
      );
    }
    const allocates = "create" in allocation || "existing" in allocation;
    if (allocates && !("generate" in job)) {
      return createFailure(
        `${this.entityType} job "${name}" does not generate, so it cannot fill an allocated entity`,
      );
    }
    const parsed = job.input.safeParse(jobInput);
    if (!parsed.success) {
      return createFailure(
        `Invalid input for ${this.entityType} job "${name}": ${parsed.error.issues
          .map(({ message }) => message)
          .join("; ")}`,
      );
    }
    // The caller starts the job, and it runs with their authority, so they
    // are admitted before anything is written; one the brain no longer
    // knows is refused here.
    const queued = await admitPackageJob(
      context.jobAuthority,
      toolCaller(executionContext),
      jobInput,
    );

    const allocated = await this.allocate(
      context,
      allocation,
      input,
      executionContext,
    );
    if ("error" in allocated) return createFailure(allocated.error);
    const entityId = allocated.entityId;
    try {
      const jobId = await context.jobs.enqueue({
        type: name,
        // The input as written, and beside it the entity a generation fills
        // and the entries the request named it from.
        data: {
          ...queued,
          ...(entityId !== undefined && { entityId }),
          ...("generate" in job &&
            definedFields({ source: generationSource(input) })),
        },
        toolContext: {
          interfaceType: executionContext.interfaceType,
          actor: executionContext.actor,
          ...definedFields({ channelId: executionContext.channelId }),
        },
      });
      const attachment =
        "attachment" in allocation ? allocation.attachment : undefined;
      return {
        success: true,
        data: {
          status: "generating",
          jobId,
          ...(entityId !== undefined && {
            entityId,
            ...(attachment && {
              attachment: createResultAttachmentSchema.parse(
                attachment({ entityId }),
              ),
            }),
          }),
        },
      };
    } catch (error) {
      // No job will fill a placeholder this create wrote; left behind it
      // would stay generating forever.
      if (allocated.written) {
        await context.entityService
          .deleteEntity({ entityType: this.entityType, id: allocated.written })
          .catch((cleanupError: unknown) => {
            this.logger.warn("Failed to remove an unqueued placeholder", {
              entityId: allocated.written,
              error: cleanupError,
            });
          });
      }
      return createFailure(getErrorMessage(error));
    }
  }

  private async allocate(
    context: EntityPluginContext,
    allocation: EntityCreateAllocation,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<
    | { readonly entityId: string | undefined; readonly written?: string }
    | { readonly error: string }
  > {
    if ("existing" in allocation) {
      const found = await context.entityService.getEntity({
        entityType: this.entityType,
        id: allocation.existing.id,
        visibilityScope: this.callerScope(executionContext),
      });
      return found
        ? { entityId: found.id }
        : {
            error: `Cannot reuse ${this.entityType} "${allocation.existing.id}", which does not exist`,
          };
    }
    if (!("create" in allocation)) return { entityId: undefined };
    const metadata = this.definition.metadata.safeParse(
      allocation.create.metadata,
    );
    if (!metadata.success) return { error: this.invalid(metadata.error) };
    // Deduplicated, as system_generate's stub is: a second import lands
    // beside the first rather than on top of it.
    const written = await context.entityService.createEntity({
      entity: {
        id: allocation.create.id,
        entityType: this.entityType,
        content: allocation.create.content,
        metadata: metadata.data,
        ...(input.visibility !== undefined && { visibility: input.visibility }),
      },
      options: {
        deduplicateId: true,
        eventContext: {
          actor: executionContext.actor,
          interfaceType: executionContext.interfaceType,
        },
      },
    });
    return { entityId: written.entityId, written: written.entityId };
  }

  /**
   * Write a first-party route's pending placeholder and queue the contract
   * job that fills it, as an entity plugin's interceptor did: a record that
   * already has the id is reused rather than written over, and one at a
   * different visibility than asked is refused.
   */
  private async applyQueuedCreate(
    context: EntityPluginContext,
    queued: QueuedCreate,
    _input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const attributed = queued.job.attributed === true;
    const placeholder = queued.placeholder;
    if (placeholder) {
      const metadata = this.definition.metadata.safeParse(placeholder.metadata);
      if (!metadata.success) return createFailure(this.invalid(metadata.error));
      const now = new Date().toISOString();
      const pending = await createPendingEntity({
        entityService: context.entityService,
        entity: {
          id: queued.entityId,
          entityType: this.entityType,
          content: placeholder.content,
          metadata: metadata.data,
          ...(placeholder.visibility !== undefined && {
            visibility: placeholder.visibility,
          }),
          created: now,
          updated: now,
        },
        ...(attributed && {
          options: { eventContext: eventContextOf(executionContext) },
        }),
      });
      if (
        placeholder.visibility !== undefined &&
        pending.existingEntity !== undefined &&
        pending.existingEntity.visibility !== placeholder.visibility
      ) {
        throw new Error(
          `Existing ${this.entityType} visibility "${pending.existingEntity.visibility}" does not match requested visibility "${placeholder.visibility}".`,
        );
      }
    }
    const jobId = await context.jobs.enqueue(
      queued.job.contract,
      queued.job.data,
      ...(attributed
        ? [{ options: attributionJobOptions(this.id, executionContext) }]
        : []),
    );
    return {
      success: true,
      data: {
        entityId: queued.entityId,
        status: "generating",
        jobId,
        attachment: createResultAttachmentSchema.parse(queued.attachment),
      },
    };
  }

  /**
   * Store a first-party route's complete record as the caller, under the
   * next free id when this one is taken, as an entity plugin's interceptor
   * did.
   */
  private async applyStoredCreate(
    context: EntityPluginContext,
    stored: StoredCreate,
    input: CreateInput,
    executionContext: CreateExecutionContext,
  ): Promise<CreateResult> {
    const metadata = this.definition.metadata.safeParse(stored.record.metadata);
    if (!metadata.success) return createFailure(this.invalid(metadata.error));
    const now = new Date().toISOString();
    const written = await context.entityService.createEntity({
      entity: {
        id: stored.record.id,
        entityType: this.entityType,
        content: stored.record.content,
        metadata: metadata.data,
        ...(input.visibility !== undefined && { visibility: input.visibility }),
        created: now,
        updated: now,
      },
      options: {
        deduplicateId: true,
        eventContext: eventContextOf(executionContext),
      },
    });
    return {
      success: true,
      data: {
        entityId: written.entityId,
        status: "created",
        attachment: createResultAttachmentSchema.parse(
          stored.attachment({ entityId: written.entityId }),
        ),
      },
    };
  }

  private createSuccess(
    status: "created" | "existing" | "updated",
    entityId: string,
    attachment:
      ((written: { readonly entityId: string }) => unknown) | undefined,
  ): CreateResult {
    return {
      success: true,
      data: {
        status,
        entityId,
        ...(attachment && {
          attachment: createResultAttachmentSchema.parse(
            attachment({ entityId }),
          ),
        }),
      },
    };
  }

  protected override async onShutdown(): Promise<void> {
    this.releases.forEach((release) => release());
    this.releases = [];
    this.widgetAbort.abort();
    const context = this.getContext();
    const widgetIds = this.dashboardWidgetIds.splice(0);
    await Promise.all(
      widgetIds.map(async (widgetId) => {
        try {
          await context.dashboard.unregisterWidget(widgetId);
        } catch (error) {
          // Shutdown goes on: a Dashboard that is already gone holds nothing
          // to unregister, and one widget must not keep the others up.
          this.logger.error(
            "Failed to unregister a declared dashboard widget",
            {
              widgetId,
              error: getErrorMessage(error),
            },
          );
        }
      }),
    );
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
    return [
      ...this.projections.map((projection) =>
        projectionRule(projection, this.version, this.scope),
      ),
      ...this.projectionRules,
    ];
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
  // Each entity with the slots its package's `configure` bound, keyed by
  // the declared definition, which projections and data sources name.
  bound: ReadonlyMap<AnyEntityDefinition, AnyEntityDefinition> = new Map(),
): DeclarativeEntityPlugin[] {
  const packageDataSourceIds = new Set(dataSources.map(({ id }) => id));
  const packageTypes = new Set(entities.map(({ type }) => type));
  return entities.map(
    (definition) =>
      new DeclarativeEntityPlugin(
        bound.get(definition) ?? definition,
        projections.filter(({ source }) => source === definition),
        metadata,
        scope,
        dataSources.filter((source) =>
          installsDataSource(source, definition, entities),
        ),
        packageDataSourceIds,
        packageTypes,
      ),
  );
}
