import { createScopedAssetReads } from "./owned-entity-writer-runtime";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  agentContextContract,
  generateExecuteContract,
  generateReportFailureContract,
  publishAssetRegisterContract,
  publishRegisterContract,
  siteBuildStagingContract,
  type PublishProvider,
  type SiteBuildStagingPayload,
} from "@brains/contracts";
import {
  EntityWriteConflictError,
  internalFullScope,
  permissionToVisibilityScope,
  ProjectionJsonObjectSchema,
  applyVisibilityToMarkdown,
  generateFrontmatter,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
  type ContentVisibility,
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
  type EntityActionPolicyConfig,
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
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { isPlainRecord } from "@brains/utils/predicates";
import { definedFields } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";
import { PluginCore } from "../plugin-core";
import { createEntityPluginContext, type EntityPluginContext } from "./context";
import { entityTypeConfigFor } from "./entity-definition-config";
import { missingGroupingMembership } from "./grouping-placement";
import { createEntityReader } from "./entity-reader";
import {
  contractJobOf,
  entityAnswersOf,
  bodyTemplateOf,
  folderTitlesOf,
  publishedStatusesOf,
  recordDisplayTitleOf,
  recordPersistValidatorOf,
  restatedMetadataOf,
  urlRouteOf,
  writesInDocumentOrderOf,
  writtenFrontmatterSchemaOf,
  readsAsWritten,
  frontmatterSchemaOf,
  builtProvider,
  withEntityRuntime,
  type AnyEntityBinding,
  type EntityRuntimeBinding,
  type EvalGenerationOptions,
  type EvalGenerationResult,
} from "./entity-runtime";
import { CallbackProgressReporter } from "@brains/utils/progress";
import { EntityCreateRouter, deepFrozen } from "./entity-create-routing";
import { onEvent } from "../internal/on-event";
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
  type EntityRunAuthority,
  generationSource,
  packageEntityWrites,
} from "./declarative-jobs";
import type { JobHandler } from "@brains/job-queue";
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
  type ProjectionWaveInput,
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
  const where = "a media attachment";
  const reader = createEntityReader(context.entityService, "public");
  // Media reads public records only; an asset-backed record's bytes are read
  // through one visible at that scope, never a bare reference.
  return withEntityRuntime(
    {
      domain: context.domain,
      themeCSS: context.themeCSS,
      identity: Object.freeze({ getProfile: () => identity.getProfile() }),
      entityService: mediaEntityReads(context.entityService),
      views: Object.freeze({ get: (name: string) => views.get(name) }),
    },
    {
      where,
      reader,
      packageReader: reader,
      ownsType: () => false,
      searchWithDistances: async (): Promise<never> => {
        throw new Error(`searchWithDistances is not available in ${where}`);
      },
      generateObject: async (): Promise<never> => {
        throw new Error(`generateObject is not available in ${where}`);
      },
      assets: createScopedAssetReads(context.entityService, "public", where),
    },
  );
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

/**
 * The body a type writes for content handed to it: a body as it is, and a
 * whole document's body as the type reads it, so a field its old files kept
 * in frontmatter and its reading moves into the body is written there, as
 * its class's adapter rewrote it. A document whose header the type refuses
 * keeps its body as written: its metadata was decoded, or refused, already.
 */
function bodyAsRead(definition: AnyEntityDefinition, content: string): string {
  const document = readMarkdownFrontmatter(content);
  if (!isPlainRecord(document.data) || Object.keys(document.data).length === 0)
    return content;
  if (!definition.markdown) return document.content;
  try {
    return definition.markdown.decode({
      content: document.content,
      frontmatter: document.data,
    }).content;
  } catch {
    // Writing never fails on a header the read path has already judged.
    return document.content;
  }
}

/**
 * A stored document read as written (storedDocumentCodec's readAsWritten):
 * the stored bytes as its content, and metadata derived from its header
 * when the header parses.
 */
function readAsWritten(
  definition: AnyEntityDefinition,
  markdown: string,
): Partial<EntityOf<AnyEntityDefinition>> {
  const header = readableHeader(markdown);
  const metadata =
    header && definition.markdown
      ? definition.markdown.decode(header).metadata
      : {};
  return {
    ...(definition.singleton === true && { id: definition.type }),
    content: markdown,
    metadata: definition.metadata.parse(currentMetadata(definition, metadata)),
  };
}

/** A document's header and body; none when its header does not parse. */
function readableHeader(
  markdown: string,
): { content: string; frontmatter: Record<string, unknown> } | undefined {
  try {
    const parsed = parseMarkdownWithFrontmatter(markdown, rawFrontmatterSchema);
    return { content: parsed.content, frontmatter: parsed.metadata };
  } catch {
    // A header that does not parse still reads, as written and with no
    // metadata, so an editor can show the document for repair; a write
    // refuses it as before.
    return undefined;
  }
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
  | "writtenFrontmatterSchema"
  | "toMarkdown"
  | "fromMarkdown"
  | "parseFrontMatter"
  | "generateFrontMatter"
  | "metadataFromFrontmatter"
> {
  return {
    // The header its class declared, when it states one; else its metadata.
    frontmatterSchema: frontmatterSchemaOf(definition) ?? definition.metadata,
    // What it writes is still every field its metadata names; a header
    // field metadata does not name is the file's own, which the serializer
    // keeps from the document written, as a stored-document class kept it.
    ...((frontmatterSchemaOf(definition) ??
      writtenFrontmatterSchemaOf(definition)) && {
      writtenFrontmatterSchema:
        writtenFrontmatterSchemaOf(definition) ?? definition.metadata,
    }),
    // A whole document handed in, as an import or an editor writes one, had
    // its frontmatter decoded into the metadata already: the type writes the
    // body under its own frontmatter, in its own order, as an entity plugin
    // class's adapter did, and the serializer keeps after it the frontmatter
    // the type does not write.
    toMarkdown(entity): string {
      return encodeEntityMarkdown(definition, {
        ...entity,
        content: bodyAsRead(definition, entity.content),
      });
    },
    fromMarkdown(markdown): Partial<EntityOf<AnyEntityDefinition>> {
      if (readsAsWritten(definition.markdown))
        return readAsWritten(definition, markdown);
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
        // A singleton's document is its one record, whose id is the type,
        // as a class adapter read it; a writer that names none, such as
        // Studio creating a missing one, creates it there.
        ...(definition.singleton === true && { id: definition.type }),
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

/** The statuses a published-only read publishes, left off when undeclared. */
function publishedStatusesAdapter(
  definition: AnyEntityDefinition,
): Pick<DeclaredAdapter, "publishedStatuses"> {
  const statuses = publishedStatusesOf(definition);
  return statuses ? { publishedStatuses: [...statuses] } : {};
}

/** A type's folder titles, left off when it names none. */
function folderTitlesAdapter(
  definition: AnyEntityDefinition,
): Pick<DeclaredAdapter, "getFolderTitles"> {
  const titles = folderTitlesOf(definition);
  return titles ? { getFolderTitles: titles } : {};
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
    // A first-party type that restates its metadata stores it as the
    // document it wrote states it.
    extractMetadata: (entity) =>
      restatedMetadataOf(definition)?.(entity.metadata) ?? entity.metadata,
    getBodyTemplate: () => bodyTemplateOf(definition),
    ...folderTitlesAdapter(definition),
    ...(writesInDocumentOrderOf(definition) && { writesInDocumentOrder: true }),
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
    ...publishedStatusesAdapter(definition),
    ...(definition.coverImage === true && { supportsCoverImage: true }),
    ...(definition.create?.fields && {
      createFieldsSchema: definition.create.fields,
    }),
    ...displayTitleAdapter(definition),
  };
}

/** A type's display title, from the whole record or its content and metadata. */
function displayTitleAdapter(
  definition: AnyEntityDefinition,
): Pick<DeclaredAdapter, "displayTitle"> {
  const recordTitle = recordDisplayTitleOf(definition);
  if (recordTitle)
    return {
      displayTitle: (entity): string | undefined =>
        recordTitle(entity, currentMetadata(definition, entity.metadata)),
    };
  return definition.displayTitle
    ? {
        displayTitle: (entity): string | undefined =>
          displayTitle(definition, entity),
      }
    : {};
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

/** A declared entity type takes no config of its own. */
const noEntityConfigSchema: z.ZodObject<Record<string, never>> = z.object({});

/** Takes one registration off again. */
type Release = () => void;

class DeclarativeEntityPlugin extends PluginCore<
  Record<string, never>,
  Record<string, never>,
  EntityPluginContext
> {
  public readonly type = "entity" as const;
  /** The default action policy this type declares, keyed by its bare type. */
  public readonly entityActionPolicy?: EntityActionPolicyConfig;
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
  /** The shell this plugin registered on, which runs its rules for an eval. */
  private scopedShell: IShell | undefined;
  private releases: readonly Release[] = [];
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
    super(scope(definition.type), metadata, {}, noEntityConfigSchema);
    // Keyed by the bare entity type: the policy is about what may be done
    // to entities of this type, not about which package declared them.
    if (definition.actions) {
      this.entityActionPolicy = {
        [definition.type]: entityActionPolicyRuleSchema.parse(
          definition.actions,
        ),
      };
    }
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
    // A create route names the type's own generation "generation"; a job
    // of that name would shadow it. A type without a generation may answer
    // that job name with a contract job, as an entity plugin class that ran
    // another handler under its generation job did.
    const namedGeneration = this.jobs["generation"];
    if (
      namedGeneration !== undefined &&
      (definition.generation !== undefined ||
        contractJobOf(namedGeneration) === undefined)
    ) {
      throw new Error(
        `${definition.type} declares a job named "generation", the name a create route gives its own generation`,
      );
    }
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

  private getEntityTypeConfig(): EntityTypeConfig {
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
  private asPackage(): EntityReader {
    const context = this.getContext();
    const self = packageSelfCall(context.jobAuthority);
    return createPackageEntityReader(
      context.entityService,
      () => self,
      (entityType) => this.ownsType(entityType),
    );
  }

  private generationHandler(
    declaration: NonNullable<AnyEntityDefinition["generation"]>,
    jobTypeName: string,
    reportsToPipeline = false,
    readsLegacyRawData = false,
  ): DeclarativeGenerationHandler {
    const context = this.getContext();
    return new DeclarativeGenerationHandler(this.logger, context, declaration, {
      entityType: this.entityType,
      jobTypeName,
      template: (localName) => this.templateName(localName),
      ownsType: (entityType) => this.ownsType(entityType),
      retries: this.retries,
      reportsToPipeline,
      readsLegacyRawData,
      pluginId: this.id,
      runtime: (authority) => this.runBinding(authority, "a generation"),
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
    scheduled: NonNullable<AnyEntityDefinition["scheduledGeneration"]>,
  ): Promise<void> {
    const context = this.getContext();
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
    const { entityService } = this.getContext();
    const derived = await Promise.all(
      sourceIds.map((sourceEntityId) =>
        entityService.listEntities({
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

  private createGenerationHandler(): JobHandler | null {
    return this.generation
      ? this.generationHandler(
          this.generation,
          `${this.entityType}:generation`,
          this.definition.scheduledGeneration !== undefined,
          true,
        )
      : null;
  }

  private getTemplates(): Record<string, Template> | null {
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

  private getDataSources(): DataSource[] {
    if (this.dataSources.length === 0) return [];
    const shell = this.scopedShell;
    if (!shell) {
      throw new Error(
        `Entity type "${this.entityType}" binds its data sources once it is registered`,
      );
    }
    // Scoped to the package, so two packages may each declare "entities";
    // read by other packages under the package's name, whatever the scope.
    return this.dataSources.map((declaration) =>
      createDeclaredDataSource(declaration, this.scope(declaration.id), {
        publicId: `${this.packageName}:${declaration.id}`,
        runtimeState: shell.getRuntimeState(),
        dataSources: shell.getDataSourceRegistry(),
      }),
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
    this.scopedShell = shell;
    const context = createEntityPluginContext(
      shell,
      this.id,
      registrationContext,
    );
    this.context = context;
    // Tool and resource execution over the message bus.
    this.setupMessageHandlers(context);

    // The type's rules are resolved before it registers, so a type that
    // writes itself fails closed as a projection source unless it opts in.
    const projectionRules = this.getProjectionRules();
    const entityTypeConfig = this.getEntityTypeConfig();
    const producesOwnEntityType = projectionRules.some(
      (rule) => rule.targetType === this.entityType,
    );
    const hasExplicitProjectionSourceOptIn =
      entityTypeConfig.projectionSource !== false &&
      entityTypeConfig.projectionSourceRole !== "excluded" &&
      (entityTypeConfig.projectionSource === true ||
        entityTypeConfig.projectionSourceRole !== undefined);
    context.entities.register(
      this.entityType,
      this.schema,
      this.adapter,
      producesOwnEntityType && !hasExplicitProjectionSourceOptIn
        ? {
            ...entityTypeConfig,
            projectionSource: false,
            projectionSourceRole: "excluded" as const,
          }
        : entityTypeConfig,
    );

    const handler = this.createGenerationHandler();
    if (handler) {
      context.jobs.registerHandler(`${this.entityType}:generation`, handler);
    }
    const templates = this.getTemplates();
    if (templates && Object.keys(templates).length > 0) {
      shell.registerTemplates(templates, this.id);
    }
    for (const dataSource of this.getDataSources()) {
      context.entities.registerDataSource(dataSource);
    }

    await this.onRegister();

    const instructions = await this.getInstructions();
    return {
      tools: [],
      resources: [],
      ...(instructions && { instructions }),
      ...(projectionRules.length > 0 && { projectionRules }),
    };
  }

  /**
   * Each step registers one thing this type declares, in this order; the
   * releases the later steps hand back are taken off when it shuts down.
   */
  protected override async onRegister(): Promise<void> {
    this.registerPersistValidators();
    this.registerJobs();
    this.registerGenerationEnqueuer();
    this.registerCreateRouting();
    this.registerEvals();
    // Built once, with the plugin's logger, when it is built with one.
    const publishProvider = this.publishProvider();
    this.registerAnalyticsReports();
    const widgets = this.boundWidgets();
    this.registerInboxSource();
    this.releases = [
      ...this.answerEntityContracts(),
      ...this.answerAgentContext(),
      ...this.answerScheduledGeneration(),
      ...this.registerAttachments(),
      ...this.subscribeSeed(),
      ...this.answerFeedStaging(),
      ...this.registerChecks(),
      ...this.registerAtprotoProjection(),
      ...this.subscribeDashboardWidgets(widgets),
      ...this.subscribePublishRegistration(publishProvider),
    ];
  }

  /**
   * What a job or an answer writes: the declaring type, under the brain's
   * policy.
   */
  private get writes(): EntityJobWrites {
    return {
      declaring: this.definition,
      requiredLevel: (entityType, action) =>
        this.requiredLevel(entityType, action),
    };
  }

  private registerPersistValidators(): void {
    const context = this.getContext();
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
    const recordValidator = recordPersistValidatorOf(this.definition);
    if (recordValidator) {
      context.entities.registerPersistValidator(
        this.entityType,
        async (entity): Promise<void> => {
          await recordValidator(
            Object.freeze({
              id: entity.id,
              content: entity.content,
              visibility: entity.visibility,
            }),
          );
        },
      );
    }
    if (this.entityTypeConfig.requiresGroupingMembership === true) {
      context.entities.registerPersistValidator(
        this.entityType,
        async (entity): Promise<void> => {
          const issue = missingGroupingMembership(
            entity,
            context.entities.getGroupings(),
          );
          if (issue) throw new z.ZodError([issue]);
        },
      );
    }
  }

  private registerJobs(): void {
    const context = this.getContext();
    const ownsType = (entityType: string): boolean => this.ownsType(entityType);
    // Local names: the jobs namespace scopes each to this type's plugin.
    Object.entries(this.jobs).forEach(([name, declaration]) => {
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
          contractJobHandler(
            declaration,
            context,
            ownsType,
            this.writes,
            this.id,
            (localName) => this.templateName(localName),
          ),
        );
        return;
      }
      context.jobs.registerHandler(
        name,
        "generate" in declaration
          ? this.generationHandler(declaration, name)
          : entityJobHandler(
              declaration,
              context,
              ownsType,
              this.writes,
              (authority) => this.runBinding(authority, "a job"),
            ),
      );
    });
  }

  /**
   * system_generate queues this type's generation through here, so the job
   * carries the authority of the caller who asked for it.
   */
  private registerGenerationEnqueuer(): void {
    if (!this.generation) return;
    const context = this.getContext();
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

  private registerCreateRouting(): void {
    const urlRoute = urlRouteOf(this.definition);
    if (!this.create && !urlRoute) return;
    new EntityCreateRouter({
      context: this.getContext(),
      definition: this.definition,
      pluginId: this.id,
      routing: this.create ?? {},
      urlRoute,
      runtime: (reader, where, anyEntities): EntityRuntimeBinding =>
        this.runtimeBinding(reader, where, anyEntities),
    }).register();
  }

  /**
   * Evals run with no caller, so as the package, with fixtures scoped to
   * this type.
   */
  private registerEvals(): void {
    const context = this.getContext();
    Object.entries(this.definition.evals ?? {}).forEach(([id, handler]) => {
      context.eval.registerHandler(id, (input) =>
        handler(
          input,
          withEntityRuntime(
            {
              ai: createGenerationAI(context, (localName) =>
                this.templateName(localName),
              ),
              entities: this.asPackage(),
              fixtures: createEvalFixtures(context, this.entityType),
            },
            // An eval runs with no caller, so its searches read as the
            // package, and so does a generation it runs.
            {
              ...this.runtimeBinding(this.asPackage(), "an eval"),
              runGeneration: (input, options) =>
                this.runGenerationForEval(input, options),
              runProjectionRule: (ruleId, options) =>
                this.runOwnProjectionRule(ruleId, options),
            },
          ),
        ),
      );
    });
  }

  private publishProvider(): PublishProvider | undefined {
    const publish = this.definition.publish;
    return publish && builtProvider(publish.provider, this.logger);
  }

  /**
   * Registered through the plugin's scoped analytics, which removes them
   * when the plugin goes.
   */
  private registerAnalyticsReports(): void {
    const context = this.getContext();
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
  }

  /** The dashboard widgets this type binds, each bound once. */
  private boundWidgets(): readonly BoundEntityWidget[] {
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
    return widgets;
  }

  /**
   * The shell removes a plugin's Inbox sources with the plugin. The Inbox is
   * read in the main process; a worker registers none.
   */
  private registerInboxSource(): void {
    const inbox = this.definition.inbox;
    const context = this.getContext();
    if (inbox && !context.executionOnly)
      context.inbox.registerSource(this.inboxSource(inbox));
  }

  /**
   * First-party answers, under the channels their contracts already have,
   * as the package acting as itself.
   */
  private answerEntityContracts(): Release[] {
    const context = this.getContext();
    return entityAnswersOf(this.definition).map((declared) =>
      context.messaging.answer(
        declared.contract,
        async (request, { sender }) =>
          declared.handle({
            request,
            sender,
            entities: await packageEntityWrites(
              context,
              this.id,
              (entityType) => this.ownsType(entityType),
              this.writes,
            ),
          }),
        declared.everyProcess === true ? { everyProcess: true } : {},
      ),
    );
  }

  /**
   * Reads are scoped to the asker, so a provider cannot surface restricted
   * records into a public conversation.
   */
  private answerAgentContext(): Release[] {
    const agentContext = this.definition.agentContext;
    if (!agentContext) return [];
    const context = this.getContext();
    return [
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
    ];
  }

  private answerScheduledGeneration(): Release[] {
    const scheduled = this.definition.scheduledGeneration;
    if (!scheduled) return [];
    return [
      this.getContext().messaging.answer(
        generateExecuteContract,
        async ({ entityType }) => {
          if (entityType === this.entityType) {
            await this.runScheduledGeneration(scheduled);
          }
        },
      ),
    ];
  }

  /** The runtime keeps the unregister handles, so an author never does. */
  private registerAttachments(): Release[] {
    const attachments = this.attachments ?? [];
    if (attachments.length === 0) return [];
    const context = this.getContext();
    const media = mediaAttachmentContext(context);
    return attachments.map((attachment) =>
      context.attachments.register(
        this.entityType,
        attachment.type,
        attachment.provider(media),
      ),
    );
  }

  private subscribeSeed(): Release[] {
    const seed = this.seed;
    if (!seed) return [];
    return [
      onEvent(this.getContext().messaging, SEED_TRIGGER_CHANNELS[seed.on], () =>
        this.plantSeed(seed),
      ),
    ];
  }

  /** Builds run in the worker, so every process answers. */
  private answerFeedStaging(): Release[] {
    const feed = this.feed;
    if (!feed) return [];
    return [
      this.getContext().messaging.answer(
        siteBuildStagingContract,
        (payload) => this.stageFeed(feed, payload),
        { everyProcess: true },
      ),
    ];
  }

  /**
   * The service scopes each check id to this plugin and hands back the
   * release.
   */
  private registerChecks(): Release[] {
    const context = this.getContext();
    return (this.definition.checks ?? []).map((check) =>
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
              entities: this.asPackage(),
              siteUrl: context.siteUrl,
              signal,
            }),
          ),
      }),
    );
  }

  private registerAtprotoProjection(): Release[] {
    const atproto = this.definition.atproto;
    if (!atproto) return [];
    return [
      this.getContext().atprotoProjections.register(
        this.atprotoProjection(atproto),
      ),
    ];
  }

  /** The Dashboard answers registrations once every plugin is in. */
  private subscribeDashboardWidgets(
    widgets: readonly BoundEntityWidget[],
  ): Release[] {
    if (widgets.length === 0) return [];
    return [
      onEvent(
        this.getContext().messaging,
        SYSTEM_CHANNELS.pluginsRegistered,
        () => this.registerDashboardWidgets(widgets),
      ),
    ];
  }

  /**
   * Announced once every plugin is registered, so the publish pipeline is
   * listening whichever order the plugins load in.
   */
  private subscribePublishRegistration(
    publishProvider: PublishProvider | undefined,
  ): Release[] {
    const publish = this.definition.publish;
    const publishAssets = this.definition.publishAssets ?? [];
    if (!publish && publishAssets.length === 0) return [];
    const context = this.getContext();
    return [
      onEvent(
        context.messaging,
        SYSTEM_CHANNELS.pluginsRegistered,
        async (): Promise<void> => {
          if (publish) {
            await context.messaging.command(publishRegisterContract, {
              entityType: this.entityType,
              provider: publishProvider ?? publish.provider,
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
            await context.messaging.command(publishAssetRegisterContract, {
              entityType: this.entityType,
              attachmentType: asset.attachmentType,
              mediaEntityType: "image",
              // The image job records the id in the frontmatter the stored
              // record carries.
              targetEntityField: {
                location: "frontmatter",
                field: asset.field,
              },
              ...definedFields({ requiredWhen: asset.requiredWhen }),
              autoGenerate: true,
            });
          }
        },
      ),
    ];
  }

  private async registerDashboardWidgets(
    widgets: readonly BoundEntityWidget[],
  ): Promise<void> {
    const context = this.getContext();
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
    visibilityScope: ContentVisibility,
  ): EntityRecordReader<EntityOf<AnyEntityDefinition>> {
    const definition = this.definition;
    const reader = createEntityReader(
      this.getContext().entityService,
      visibilityScope,
    );
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
   * package; opening and acting are refused below admin, read as the actor,
   * and acting writes only through edits the actor is allowed.
   */
  private inboxSource(declared: EntityInboxDeclaration): InboxSource {
    const context = this.getContext();
    // The declaring type is the package's own, so it lists at every visibility.
    const full = internalFullScope("the declared Inbox lists as its package");
    const asActor = (
      actor: InboxActor,
    ): Omit<EntityInboxActionContext<AnyEntityDefinition>, "edits"> => {
      const scope = permissionToVisibilityScope(actor.permissionLevel);
      return {
        actor,
        records: this.records(scope),
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
            records: this.records(full),
            entities: this.asPackage(),
          }),
        )),
      ],
      ...(resolveDetail && {
        resolveDetail: (
          itemId: string,
          actor: InboxActor,
          signal: AbortSignal,
        ): Promise<InboxItemDetail> => {
          return resolveDetail(
            itemId,
            Object.freeze({ ...asActor(actor), signal }),
          );
        },
      }),
      act: async (
        itemId: string,
        actionId: string,
        actor: InboxActor,
      ): Promise<void> => {
        return declared.act(
          itemId,
          actionId,
          Object.freeze({
            ...asActor(actor),
            edits: this.inboxEdits(actor),
          }),
        );
      },
    };
  }

  private inboxEdits(actor: InboxActor): EntityInboxEdits<AnyEntityDefinition> {
    const context = this.getContext();
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
    declared: EntityAtprotoProjection<EntityOf<AnyEntityDefinition>>,
  ): AtprotoProjection {
    const context = this.getContext();
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
          withEntityRuntime(
            {
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
            },
            atprotoRecordRuntime(context, this.entityType, entities),
          ),
        ),
    };
  }

  /**
   * The internal runtime a first-party definition reaches through
   * entityRuntime(context): searches at the call's visibility, reads of the
   * package's own types as the package, and free-form structured AI.
   */
  private runtimeBinding(
    reader: EntityReader,
    where: string,
    anyEntities?: AnyEntityBinding,
  ): EntityRuntimeBinding {
    const context = this.getContext();
    return {
      where,
      reader,
      ...(anyEntities && { anyEntities }),
      packageReader: this.asPackage(),
      ownsType: (entityType) => this.ownsType(entityType),
      searchWithDistances: (request) =>
        context.entityService.searchWithDistances(request),
      generateObject: (prompt, schema) =>
        context.ai.generateObject(prompt, schema),
      generate: createGenerationAI(context, (localName) =>
        this.templateName(localName),
      ).generate,
      logger: context.logger,
      identity: Object.freeze({
        getProfile: () => context.identity.getProfile(),
      }),
    };
  }

  /**
   * One of this type's own declared projection rules, run by the shell as
   * production runs it, with no wave, memo or write; any other rule refused.
   */
  private async runOwnProjectionRule(
    ruleId: string,
    options?: { readonly inputs?: readonly ProjectionWaveInput[] },
  ): Promise<readonly ProjectionWriteIntent[]> {
    const shell = this.scopedShell;
    if (!shell || !this.projectionRules.some(({ id }) => id === ruleId)) {
      throw new Error(`Unknown projection rule "${ruleId}" for ${this.id}`);
    }
    return shell.runProjectionRule(ruleId, options);
  }

  /**
   * Run this type's generation in process for an eval, queued as the
   * package, as an entity plugin class's eval ran its generation handler.
   */
  private async runGenerationForEval(
    input: unknown,
    options: EvalGenerationOptions = {},
  ): Promise<EvalGenerationResult> {
    const generation = this.generation;
    if (!generation) {
      throw new Error(`Entity "${this.entityType}" declares no generation`);
    }
    const handler = this.generationHandler(
      generation,
      `${this.entityType}:generation`,
      this.definition.scheduledGeneration !== undefined,
    );
    const data = handler.validateAndParse(
      await admitPackageJob(this.getContext().jobAuthority, undefined, input),
    );
    if (data === null) {
      return { success: false, error: "Invalid generation input" };
    }
    const onProgress = options.onProgress;
    const reporter = onProgress
      ? CallbackProgressReporter.from(async ({ progress, message }) => {
          await onProgress({ progress, ...definedFields({ message }) });
        })
      : undefined;
    const result = await handler.process(
      data,
      `eval-${Date.now()}`,
      reporter ?? CallbackProgressReporter.noop(),
    );
    return { ...result };
  }

  /**
   * The internal runtime a declared job or generation reaches: reads at the
   * run's authority, untyped ones at the scope the run reads each type at.
   */
  private runBinding(
    authority: EntityRunAuthority,
    where: string,
  ): EntityRuntimeBinding {
    return this.runtimeBinding(authority.entities, where, {
      service: this.getContext().entityService,
      scope: (entityType) => authority.scope(entityType),
    });
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
    feed: EntityFeedDeclaration<EntityOf<AnyEntityDefinition>>,
    payload: SiteBuildStagingPayload,
  ): Promise<void> {
    try {
      await this.writeFeed(feed, payload);
    } catch (error) {
      this.logger.error(`Failed to write the ${this.entityType} feed`, error);
      payload.reportFailure(
        `${this.entityType} feed generation failed: ${getErrorMessage(error)}`,
      );
    }
  }

  private async writeFeed(
    feed: EntityFeedDeclaration<EntityOf<AnyEntityDefinition>>,
    payload: SiteBuildStagingPayload,
  ): Promise<void> {
    // A preview carries everything so an author sees unpublished work in
    // place; a production build carries what the type counts as published.
    const stored = await this.getContext().entityService.listEntities({
      entityType: this.entityType,
      options: {
        limit: 1000,
        publishedOnly: payload.environment === "production",
      },
    });
    const build = Object.freeze({ environment: payload.environment });
    const items = stored.flatMap((entity) => {
      const item = feed.toItem(
        parseDefinitionEntity(this.definition, entity),
        build,
      );
      return item ? [feedItemSchema.parse(item)] : [];
    });
    if (items.length === 0) return;

    // The channel links the site as configured and the feed hangs off it;
    // item links join the site and the route with one slash. This is the
    // feed the blog plugin class wrote, byte for byte.
    const siteUrl = payload.siteConfig.url ?? "https://example.com";
    const siteRoot = siteUrl.replace(/\/+$/u, "");
    const xml = renderRssFeed(
      items,
      {
        title: payload.siteConfig.title ?? feed.title ?? "Feed",
        description:
          payload.siteConfig.description ??
          feed.description ??
          "Latest updates",
        link: siteUrl,
        selfLink: `${siteUrl}/${feed.path}`,
      },
      (item) =>
        `${siteRoot}/${payload
          .generateEntityUrl(this.entityType, item.slug)
          .replace(/^\/+/u, "")}`,
    );
    const target = join(payload.outputDir, feed.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, xml, "utf8");
  }

  /** Create-if-absent: a seed never overwrites authored content. */
  private async plantSeed(
    seed: EntitySeedDefinition<AnyEntityDefinition["metadata"]>,
  ): Promise<void> {
    const { entityService } = this.getContext();
    const existing = await entityService.getEntity({
      entityType: this.entityType,
      id: seed.id,
      visibilityScope: internalFullScope(
        "seed checks whether its default exists; no content returned",
      ),
    });
    if (existing) return;
    try {
      await entityService.createEntity({
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

  private getProjectionRules(): ProjectionRule[] {
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

/** Whether a value is an entity type a declared package installed. */
export function isDeclarativeEntityPlugin(value: unknown): boolean {
  return value instanceof DeclarativeEntityPlugin;
}

/**
 * The runtime an AT Protocol record is built with: public reads only, the
 * record being published to a public PDS, and the bytes of an asset-backed
 * record read through one visible at that scope.
 */
function atprotoRecordRuntime(
  context: EntityPluginContext,
  entityType: string,
  entities: EntityReader,
): EntityRuntimeBinding {
  const where = "an AT Protocol record";
  return {
    where,
    reader: entities,
    packageReader: entities,
    ownsType: (type) => type === entityType,
    searchWithDistances: async (): Promise<never> => {
      throw new Error(`searchWithDistances is not available in ${where}`);
    },
    generateObject: async (): Promise<never> => {
      throw new Error(`generateObject is not available in ${where}`);
    },
    assets: createScopedAssetReads(context.entityService, "public", where),
  };
}
