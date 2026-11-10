import { AsyncLocalStorage } from "node:async_hooks";
import {
  SdkError,
  type ImageAspectRatio,
  fetchVoiceGuidance,
  generateReportFailureContract,
  generateReportSuccessContract,
  type GenerationResult,
} from "@brains/contracts";
import {
  canWriteVisibility,
  canonicalContentVisibilitySchema,
  internalFullScope,
  isVisibleWithinScope,
  type ContentVisibility,
} from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";
import type { EntityActionRequiredLevel } from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import { parseMarkdown, updateFrontmatterField } from "@brains/utils/markdown";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { isPlainRecord } from "@brains/utils/predicates";
import type { ProgressReporter } from "@brains/utils/progress";
import type { RetryScope } from "@brains/utils/retry-backoff";
import { definedFields } from "@brains/utils/strip-undefined";
import { slugify } from "@brains/utils/string-utils";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  BaseGenerationJobHandler,
  type GeneratedContent,
} from "../service/base-generation-job-handler";
import {
  createPackageEntityReader,
  packageReadScope,
  packageSelfCall,
  queuedJobCall,
  serviceJobDataSchema,
  type PackageCall,
  type QueuedJobCall,
  type ServiceJobData,
} from "../service/job-authority";
import type { EntityPluginContext } from "./context";
import type {
  AnyEntityDefinition,
  EntityEvalFixtures,
  EntityGenerationAI,
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationLink,
  EntityJobContext,
  EntityJobDeclaration,
  EntityJobMessaging,
  EntityJobProgress,
  EntityReader,
  OwnedEntityWriter,
} from "./entity-definition-contract";
import { waitForEmbeddingsToDrain } from "./embedding-drain";
import {
  afterGenerationOf,
  isDeduplicated,
  withEntityRuntime,
  type EntityRuntimeBinding,
  type GenerationOutcome,
} from "./entity-runtime";
import { sharedUploadScope } from "../service/upload-registry";
import type { AttachmentResolveRequest } from "../service/attachment-registry";
import {
  assertOwnedWriteAllowed,
  createOwnedEntityWriter,
} from "./owned-entity-writer-runtime";

/**
 * Template generation through main's AI path: a template this type declares,
 * named locally, with the style guide governing voice when asked.
 */
export function createGenerationAI(
  context: EntityPluginContext,
  template: (localName: string) => string,
  signal?: AbortSignal,
): EntityGenerationAI {
  return Object.freeze({
    async generate<TSchema extends z.ZodType>(
      request: Parameters<EntityGenerationAI["generate"]>[0],
      schema: TSchema,
    ): Promise<z.output<TSchema>> {
      const templateName = template(request.template);
      const voice = request.voice
        ? await fetchVoiceGuidance(context.entityService)
        : "";
      const raw = await context.ai.generate(
        {
          prompt: request.prompt,
          templateName,
          ...(request.data && { data: { ...request.data } }),
          ...definedFields({
            representedIdentity: request.representedIdentity,
          }),
          ...(voice && { styleGuide: { voice } }),
        },
        z.unknown(),
        signal,
      );
      return parseWithSchema<TSchema>(schema, raw);
    },
  });
}

/**
 * Fixture control for one declaring type: seed what an eval measures, wait
 * for embeddings, and reset this type's records plus what was seeded.
 */
export function createEvalFixtures(
  context: EntityPluginContext,
  entityType: string,
): EntityEvalFixtures {
  const seeded = new Map<string, { entityType: string; id: string }>();
  const key = (type: string, id: string): string => `${type}\u0000${id}`;
  return Object.freeze({
    async seed(
      entity: Parameters<EntityEvalFixtures["seed"]>[0],
    ): Promise<void> {
      await context.entityService.createEntity({
        entity: {
          id: entity.id,
          entityType: entity.entityType,
          content: entity.content,
          visibility: canonicalContentVisibilitySchema.parse(
            entity.visibility ?? "public",
          ),
          metadata: { ...entity.metadata },
        },
      });
      seeded.set(key(entity.entityType, entity.id), {
        entityType: entity.entityType,
        id: entity.id,
      });
    },
    async reset(
      options?: Parameters<EntityEvalFixtures["reset"]>[0],
    ): Promise<void> {
      const visibilityScope = canonicalContentVisibilitySchema.parse(
        options?.visibilityScope ?? "public",
      );
      const stored = await context.entityService.listEntities({
        entityType,
        options: { filter: { visibilityScope } },
      });
      const targets = new Map([
        ...stored.map(
          (entity): [string, { entityType: string; id: string }] => [
            key(entity.entityType, entity.id),
            { entityType: entity.entityType, id: entity.id },
          ],
        ),
        ...seeded,
      ]);
      await Promise.all(
        [...targets.values()].map((target) =>
          context.entityService.deleteEntity(target),
        ),
      );
      seeded.clear();
    },
    settleEmbeddings: (): Promise<void> =>
      waitForEmbeddingsToDrain(context.jobs),
  });
}

/**
 * What a declared job reads and writes as: whoever started it, resolved again
 * when it runs, or the package itself when the package queued it. Acting as
 * itself, the package reads and writes the package's own types at every
 * visibility and past the action policy, as a service package does; any
 * other type, and every type for a requester, is held to the run's access.
 */
export interface EntityRunAuthority {
  /** Definition-typed reads, each type at `scope`. */
  readonly entities: EntityReader;
  /** Where a read of the type looks. */
  scope(entityType: string): ContentVisibility;
  /** Why the run may not take this action on the type, when it may not. */
  refusal(entityType: string, action: "create" | "update"): string | undefined;
  /** Why the run may not write the type at this visibility, when it may not. */
  visibilityRefusal(
    entityType: string,
    visibility: ContentVisibility,
  ): string | undefined;
}

/** A queued job's authority, for a call resolved when the job runs. */
async function runAuthority(
  context: EntityPluginContext,
  call: PackageCall,
  ownsType: (entityType: string) => boolean,
): Promise<EntityRunAuthority> {
  const access = await call.access();
  const ownedByPackage = (entityType: string): boolean =>
    call.asPackage === true && ownsType(entityType);
  return Object.freeze({
    entities: createPackageEntityReader(
      context.entityService,
      () => call,
      ownsType,
    ),
    scope: (entityType: string): ContentVisibility =>
      packageReadScope(call, ownsType(entityType), access),
    refusal: (
      entityType: string,
      action: "create" | "update",
    ): string | undefined => {
      if (ownedByPackage(entityType)) return undefined;
      try {
        context.permissions.assertEntityActionAllowed(entityType, action, {
          userPermissionLevel: access.permissionLevel,
        });
        return undefined;
      } catch (error) {
        // The policy's refusal names the action and the level it needs.
        return getErrorMessage(error);
      }
    },
    visibilityRefusal: (
      entityType: string,
      visibility: ContentVisibility,
    ): string | undefined =>
      ownedByPackage(entityType) ||
      canWriteVisibility(access.permissionLevel, visibility)
        ? undefined
        : `A ${access.permissionLevel} requester cannot write a ${visibility} ${entityType}`,
  });
}

const generationSourceSchema: z.ZodObject<{
  entityType: z.ZodString;
  ids: z.ZodArray<z.ZodString>;
}> = z.object({
  entityType: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});

/** The entries a generation is written from, as the runtime records them. */
export type GenerationSource = z.output<typeof generationSourceSchema>;

/**
 * The source a generation's queued data names, in the fields the content
 * pipeline, `system_generate` and a create request write it in:
 * `sourceEntityType` with `sourceEntityId` or `sourceEntityIds`.
 */
export function generationSource(fields: {
  readonly sourceEntityType?: unknown;
  readonly sourceEntityId?: unknown;
  readonly sourceEntityIds?: unknown;
}): GenerationSource | undefined {
  const { sourceEntityType, sourceEntityId, sourceEntityIds } = fields;
  if (typeof sourceEntityType !== "string" || sourceEntityType === "") {
    return undefined;
  }
  const named = [
    ...(typeof sourceEntityId === "string" ? [sourceEntityId] : []),
    ...(Array.isArray(sourceEntityIds)
      ? sourceEntityIds.filter((id): id is string => typeof id === "string")
      : []),
  ].filter((id) => id !== "");
  const ids = [...new Set(named)];
  return ids.length > 0 ? { entityType: sourceEntityType, ids } : undefined;
}

/** The more private of two visibilities. */
function morePrivate(
  held: ContentVisibility | undefined,
  next: ContentVisibility,
): ContentVisibility {
  return held === undefined || isVisibleWithinScope(held, next) ? next : held;
}

/** The parts of a job's context every declared job shares, frozen. */
function jobContext<TInput>(
  context: EntityPluginContext,
  input: TInput,
  progress: ProgressReporter,
  signal: AbortSignal,
  entities: EntityReader,
): EntityJobContext<TInput> {
  const messaging: EntityJobMessaging = Object.freeze({
    publish: async (message: {
      readonly topic: string;
      readonly data: object;
    }): Promise<void> => {
      // A published message is an event: every subscriber hears it.
      await context.messaging.send({
        type: message.topic,
        payload: { ...message.data },
        broadcast: true,
      });
    },
  });
  const reporter: EntityJobProgress = Object.freeze({
    report: (update: {
      readonly progress: number;
      readonly total?: number | undefined;
      readonly message?: string | undefined;
    }): Promise<void> =>
      progress.report({
        progress: update.progress,
        ...definedFields({ total: update.total, message: update.message }),
      }),
  });
  return Object.freeze({
    input,
    entities,
    messaging,
    progress: reporter,
    signal,
  });
}

/** What a declared job may write, and the policy its writes are held to. */
export interface EntityJobWrites {
  /** The type whose `jobs` slot declares the job: the one type it writes. */
  readonly declaring: AnyEntityDefinition;
  /** The level a type's action needs under the brain's policy. */
  requiredLevel(
    entityType: string,
    action: "create" | "update" | "delete",
  ): EntityActionRequiredLevel | undefined;
}

/**
 * The writes a declared job's `handle` makes: the declaring type's records,
 * as the run's authority, with the service writer's semantics. A requester
 * is also held to the visibility they may write.
 */
function entityJobWriter(
  context: EntityPluginContext,
  call: QueuedJobCall,
  authority: EntityRunAuthority,
  ownsType: (entityType: string) => boolean,
  writes: EntityJobWrites,
): OwnedEntityWriter<AnyEntityDefinition> {
  const { declaring } = writes;
  return createOwnedEntityWriter({
    entityService: context.entityService,
    owned: (definition) => {
      if (definition.type !== declaring.type) {
        throw new SdkError("permission_denied", {
          message: `A ${declaring.type} job may only write ${declaring.type} records, and "${definition.type}" is not its type`,
        });
      }
      return declaring;
    },
    currentCall: () => call,
    assertWriteAllowed: (entityType, action, current) =>
      assertOwnedWriteAllowed(
        writes.requiredLevel(entityType, action),
        entityType,
        action,
        current,
      ),
    readScope: (current, entityType, access) =>
      packageReadScope(current, ownsType(entityType), access),
    assertCreateVisibility: async (entityType, visibility) => {
      const refusal = authority.visibilityRefusal(entityType, visibility);
      if (refusal) {
        throw new SdkError("permission_denied", {
          message: refusal,
          publicMessage: refusal,
        });
      }
    },
  });
}

/**
 * Reads and writes of the declaring type as the package acting as itself,
 * with no caller behind it: its own types at every visibility and past the
 * action policy, other types at its own grant, its writes attributed to it.
 */
export async function packageEntityWrites(
  context: EntityPluginContext,
  pluginId: string,
  ownsType: (entityType: string) => boolean,
  writes: EntityJobWrites,
): Promise<EntityReader & OwnedEntityWriter<AnyEntityDefinition>> {
  const call: QueuedJobCall = {
    ...packageSelfCall(context.jobAuthority),
    eventContext: { actor: { kind: "service", serviceId: pluginId } },
  };
  const authority = await runAuthority(context, call, ownsType);
  return Object.freeze({
    ...authority.entities,
    ...entityJobWriter(context, call, authority, ownsType, writes),
  });
}

/**
 * Bind a declared job that does its own work. It reads as whoever started
 * it, as a service package's job does, and writes the declaring type's
 * records as them.
 */
export function entityJobHandler(
  declaration: EntityJobDeclaration,
  context: EntityPluginContext,
  ownsType: (entityType: string) => boolean,
  writes: EntityJobWrites,
  runtime: (authority: EntityRunAuthority) => EntityRuntimeBinding,
): JobHandler<string, ServiceJobData, unknown> {
  // Queued data names who started the job; data without it is invalid.
  const dataSchema = serviceJobDataSchema(declaration.input);
  return {
    // The queue checks a job's data when it is queued and when it runs, and
    // keeps what this answers: the input as written, so it is parsed once.
    validateAndParse(data): ServiceJobData | null {
      const parsed = dataSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    async process(job, _jobId, progress, signal): Promise<unknown> {
      // Its requester's current access, never more than it was admitted at;
      // a revoked or rebound requester is refused before the job reads.
      const call = await queuedJobCall(context.jobAuthority, job);
      const authority = await runAuthority(context, call, ownsType);
      const base = jobContext(
        context,
        parseWithSchema(declaration.input, job.input),
        progress,
        signal,
        authority.entities,
      );
      return declaration.handle(
        withEntityRuntime(
          {
            ...base,
            entities: Object.freeze({
              ...authority.entities,
              ...entityJobWriter(context, call, authority, ownsType, writes),
            }),
          },
          runtime(authority),
        ),
      );
    },
  };
}

/**
 * Bind a first-party job another package queues through its contract. Its
 * queued data is the contract's input as written, with no requester beside
 * it, so it runs as the package, as the entity plugin classes' job handlers
 * did: it writes its own type at every visibility past the policy, reads
 * other types at the package's grant, and links what it made into a target
 * past the target's action policy.
 */
export function contractJobHandler(
  declaration: EntityJobDeclaration,
  context: EntityPluginContext,
  ownsType: (entityType: string) => boolean,
  writes: EntityJobWrites,
  pluginId: string,
  template: (localName: string) => string,
): JobHandler<string, unknown, unknown> {
  return {
    validateAndParse(data): unknown {
      const parsed = declaration.input.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    async process(data, _jobId, progress, signal): Promise<unknown> {
      const call: QueuedJobCall = {
        ...packageSelfCall(context.jobAuthority),
        eventContext: { actor: { kind: "service", serviceId: pluginId } },
      };
      const authority = await runAuthority(context, call, ownsType);
      const uploads = context.uploads.scoped(sharedUploadScope);
      const base = jobContext(
        context,
        data,
        progress,
        signal,
        authority.entities,
      );
      return declaration.handle(
        withEntityRuntime(
          {
            ...base,
            entities: Object.freeze({
              ...authority.entities,
              ...entityJobWriter(context, call, authority, ownsType, writes),
            }),
          },
          {
            where: "a contract job",
            reader: authority.entities,
            packageReader: authority.entities,
            ownsType,
            searchWithDistances: (request) =>
              context.entityService.searchWithDistances(request),
            generateObject: (prompt, schema) =>
              context.ai.generateObject(prompt, schema),
            // Through the templates its type declares, as the entity plugin
            // classes' job handlers generated through their own.
            generate: createGenerationAI(context, template, signal).generate,
            anyEntities: {
              service: context.entityService,
              // Public, as the entity plugin classes' job handlers read
              // through the store's default scope; the typed reads and
              // writes reach the package's own types at every visibility.
              scope: () => "public",
            },
            job: {
              logger: context.logger,
              images: Object.freeze({
                canGenerate: (): boolean => context.ai.canGenerateImages(),
                generate: async (
                  prompt: string,
                  options?: {
                    readonly aspectRatio?: ImageAspectRatio | undefined;
                  },
                ): Promise<{ readonly dataUrl: string }> => {
                  const { dataUrl } = await context.ai.generateImage(
                    prompt,
                    definedFields({ aspectRatio: options?.aspectRatio }),
                  );
                  return { dataUrl };
                },
              }),
              attachments: Object.freeze({
                resolve: (request: AttachmentResolveRequest) =>
                  context.attachments.resolve({ ...request }),
              }),
              uploads: Object.freeze({
                read: (uploadId: string) => uploads.read(uploadId),
                readRecord: (uploadId: string) => uploads.readRecord(uploadId),
              }),
              linkInto: async (
                entityId: string,
                link: EntityGenerationLink,
              ): Promise<void> => {
                const problem = await linkTargetProblem(
                  context,
                  link,
                  authority,
                );
                if (problem) throw new Error(problem);
                await writeGenerationLink(context, entityId, link, authority);
              },
            },
          },
        ),
      );
    },
  };
}

/**
 * Why a link cannot be made, checked before anything is saved: a write of the
 * target its run may not make, a target the run cannot see, or a cover on a
 * type that never declared one — the same refusal `system_update` makes.
 */
export async function generationLinkProblem(
  context: EntityPluginContext,
  link: EntityGenerationLink,
  authority: EntityRunAuthority,
): Promise<string | undefined> {
  return (
    authority.refusal(link.entityType, "update") ??
    (await linkTargetProblem(context, link, authority))
  );
}

/**
 * Why a link's target cannot hold it: one the run cannot see, a cover on a
 * type that never declared one, or a field or list a declared type's
 * metadata cannot hold. The target's action policy is not asked.
 */
export async function linkTargetProblem(
  context: EntityPluginContext,
  link: EntityGenerationLink,
  authority: EntityRunAuthority,
): Promise<string | undefined> {
  // A target the run cannot see is not there for it, so the link never
  // writes an entry its requester may not write.
  const target = await context.entityService.getEntity({
    entityType: link.entityType,
    id: link.entityId,
    visibilityScope: authority.scope(link.entityType),
  });
  if (!target) {
    return `Target entity not found: ${link.entityType}/${link.entityId}`;
  }
  if (
    "field" in link &&
    link.field === "coverImageId" &&
    context.entities.getAdapter(link.entityType)?.supportsCoverImage !== true
  ) {
    return `Entity type '${link.entityType}' doesn't support cover images`;
  }
  // A declared type's metadata is its frontmatter, so a link writes one of
  // its metadata fields; one the schema does not declare would be stored
  // where no read reaches it. Other types keep free-form frontmatter.
  if (
    context.entities.getAdapter(link.entityType)?.metadataFromFrontmatter !==
    true
  ) {
    return undefined;
  }
  const schema = context.entities.getEffectiveFrontmatterSchema(
    link.entityType,
  );
  if (!schema) return undefined;
  const linked = "field" in link ? link.field : link.list;
  // The metadata as the link would leave it, with a stand-in for the id.
  const probe = {
    ...target.metadata,
    [linked]:
      "field" in link
        ? "linked-entity"
        : appendToList(target.metadata[link.list], link, "linked-entity"),
  };
  let parsed: unknown;
  try {
    parsed = schema.parse(probe);
  } catch {
    return `Entity type '${link.entityType}' field '${linked}' cannot hold a link`;
  }
  return typeof parsed === "object" &&
    parsed !== null &&
    Object.hasOwn(parsed, linked)
    ? undefined
    : `Entity type '${link.entityType}' declares no metadata field '${linked}' to link into`;
}

/**
 * The target's list with this entity in it and superseded entries out, in
 * order, without listing an entity twice.
 */
function appendToList(
  held: unknown,
  link: {
    readonly list: string;
    readonly replaces?: readonly string[] | undefined;
  },
  entityId: string,
): { id: string }[] {
  const dropped = new Set(link.replaces ?? []);
  const kept = (Array.isArray(held) ? held : []).flatMap((item: unknown) =>
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string" &&
    !dropped.has(item.id)
      ? [{ id: item.id }]
      : [],
  );
  return kept.some(({ id }) => id === entityId)
    ? kept
    : [...kept, { id: entityId }];
}

/** Point the target at what a generation produced. */
export async function writeGenerationLink(
  context: EntityPluginContext,
  entityId: string,
  link: EntityGenerationLink,
  authority: EntityRunAuthority,
): Promise<void> {
  // As stored, so the target is written back with its own references rather
  // than their resolved data; read as the run reads, as the check was.
  const target = await context.entityService.getEntityRaw({
    entityType: link.entityType,
    id: link.entityId,
    visibilityScope: authority.scope(link.entityType),
  });
  if (!target) {
    throw new Error(
      `Cannot link ${entityId} into ${link.entityType}/${link.entityId}, which does not exist`,
    );
  }
  // A declared type's metadata is its frontmatter and its content is the
  // body, so the link is a metadata write. Other types keep the field in the
  // file, and their content is the file.
  const declared =
    context.entities.getAdapter(link.entityType)?.metadataFromFrontmatter ===
    true;
  const fields = declared
    ? target.metadata
    : parseMarkdown(target.content).frontmatter;
  const [field, value] =
    "field" in link
      ? [link.field, entityId]
      : [link.list, appendToList(fields[link.list], link, entityId)];
  await context.entityService.updateEntity({
    entity: {
      ...target,
      content: declared
        ? target.content
        : updateFrontmatterField(target.content, field, value),
      // Metadata that already carries the field must agree with the file.
      metadata:
        declared || Object.hasOwn(target.metadata, field)
          ? { ...target.metadata, [field]: value }
          : target.metadata,
    },
  });
}

/** The allocated entity a generation fills, when its job was given one. */
function allocatedEntityId(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("entityId" in data)) {
    return undefined;
  }
  const entityId = data.entityId;
  return typeof entityId === "string" && entityId.trim().length > 0
    ? entityId.trim()
    : undefined;
}

type LinkedContent = GeneratedContent & {
  readonly linkInto: EntityGenerationLink;
};

function isLinked(generated: GeneratedContent): generated is LinkedContent {
  return "linkInto" in generated;
}

export interface GenerationTarget {
  readonly entityType: string;
  readonly jobTypeName: string;
  /** The registered name of a template this type declares. */
  readonly template: (localName: string) => string;
  /** Whether a type is one the declaring package owns. */
  readonly ownsType: (entityType: string) => boolean;
  readonly retries?: RetryScope | undefined;
  /** Tell the content pipeline how each run went: the type is scheduled. */
  readonly reportsToPipeline?: boolean | undefined;
  /**
   * Whether this is the type's own `{type}:generation`, which an entity
   * plugin class queued in its handler's raw shape before the type was
   * declared; no other declared job ever was.
   */
  readonly readsLegacyRawData?: boolean | undefined;
  /** The plugin a job queued in the class handler's raw shape runs as. */
  readonly pluginId: string;
  /** The internal runtime a run reaches, at the run's authority. */
  readonly runtime: (authority: EntityRunAuthority) => EntityRuntimeBinding;
}

/**
 * A generation's queued data: a package job's, with the entity it fills and
 * the entries it is written from beside its input; the runtime alone writes
 * both. The input is checked by the base handler, which also reads a cover
 * request from it.
 */
const generationJobDataSchema = serviceJobDataSchema(z.unknown()).extend({
  entityId: z.string().optional(),
  source: generationSourceSchema.optional(),
});

/**
 * A generation queued before its type was declared, in the class handler's
 * raw shape: its input as written, with the entity it fills beside it and
 * no requester recorded. Tracked in docs/legacy-code-inventory.json
 * (legacy-raw-generation-data) for removal once no such job can be pending.
 */
const legacyGenerationDataSchema = z.object({
  legacyRawData: z.literal(true),
  input: z.unknown(),
  entityId: z.string().optional(),
  source: generationSourceSchema.optional(),
});

type LegacyGenerationData = z.output<typeof legacyGenerationDataSchema>;

/**
 * Queued data in the class handler's raw shape, read as a legacy job; data
 * that names a requester is a package job's, whose envelope it failed.
 */
function legacyGenerationData(data: unknown): LegacyGenerationData | null {
  const stored = legacyGenerationDataSchema.safeParse(data);
  if (stored.success) return stored.data;
  if (!isPlainRecord(data) || "authority" in data) return null;
  const { entityId, ...input } = data;
  return {
    legacyRawData: true,
    input,
    ...(typeof entityId === "string" && { entityId }),
    ...definedFields({ source: generationSource(data) }),
  };
}

/** One running generation: its signal, its input, and whom it acts as. */
interface GenerationRun {
  readonly signal: AbortSignal;
  readonly input: unknown;
  readonly authority: EntityRunAuthority;
  readonly source: GenerationSource | undefined;
}

/**
 * A declared generation on main's generation lifecycle: the base handler
 * fills a pre-allocated stub (keeping edits made while it generated), marks
 * it failed on refusal, error or terminal failure, and creates the entity
 * when nothing was allocated. This class supplies the declared `generate`,
 * the link write, and whom both act as: the generation's requester, or the
 * package when the package queued it.
 */
export class DeclarativeGenerationHandler extends BaseGenerationJobHandler<unknown> {
  private readonly runs = new AsyncLocalStorage<GenerationRun>();
  private readonly declaration: EntityGenerationDeclaration;
  private readonly target: GenerationTarget;

  constructor(
    logger: Logger,
    context: EntityPluginContext,
    declaration: EntityGenerationDeclaration,
    target: GenerationTarget,
  ) {
    super(logger, context, {
      schema: declaration.input,
      jobTypeName: target.jobTypeName,
      entityType: target.entityType,
      retries: target.retries,
    });
    this.declaration = declaration;
    this.target = target;
  }

  /**
   * Queued data names who started the generation; data without it is
   * invalid. The input is checked as the base handler checks it, which also
   * reads a cover request from it, and kept as written, since the queue
   * stores what this answers: `generate` parses it once.
   */
  override validateAndParse(data: unknown): unknown {
    const job = generationJobDataSchema.safeParse(data);
    const queued = job.success
      ? job.data
      : this.target.readsLegacyRawData === true
        ? legacyGenerationData(data)
        : null;
    if (!queued) return null;
    const checked = super.validateAndParse(queued.input);
    if (checked === null) return null;
    return {
      ...queued,
      ...definedFields({
        coverImage: isPlainRecord(checked) ? checked["coverImage"] : undefined,
      }),
    };
  }

  override async process(
    data: unknown,
    jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    const envelope = generationJobDataSchema.safeParse(data);
    const job = envelope.success
      ? envelope.data
      : legacyGenerationDataSchema.parse(data);
    // Its requester's current access, never more than it was admitted at; a
    // revoked or rebound requester is refused before anything runs. A job
    // queued in the class handler's raw shape recorded none, and runs as
    // the package, as the class handler ran it.
    const call: QueuedJobCall =
      "legacyRawData" in job
        ? {
            ...packageSelfCall(this.context.jobAuthority),
            eventContext: {
              actor: { kind: "service", serviceId: this.target.pluginId },
            },
          }
        : await queuedJobCall(this.context.jobAuthority, job);
    const run: GenerationRun = {
      signal: signal ?? new AbortController().signal,
      input: job.input,
      authority: await runAuthority(this.context, call, this.target.ownsType),
      source: job.source,
    };
    return this.runs.run(run, () =>
      super.process(data, jobId, progressReporter),
    );
  }

  protected async generate(
    data: unknown,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const { signal, input, authority, source } = this.currentRun();
    const entityId = allocatedEntityId(data);
    // Written as its requester: a create of this type is held to its policy,
    // and an allocated entity is filled only while they may still see it, so
    // the write never lands at a visibility they may not write. A new entity
    // is written without one, which is public.
    const refused = authority.refusal(this.entityType, "create");
    if (refused) this.failEarly(refused);
    const allocated =
      entityId === undefined
        ? undefined
        : await this.context.entityService.getEntity({
            entityType: this.entityType,
            id: entityId,
            visibilityScope: authority.scope(this.entityType),
          });
    if (entityId !== undefined && !allocated) {
      this.failEarly(
        `Pre-allocated entity stub not found: ${this.entityType}/${entityId}`,
      );
    }
    const generationContext = {
      ...jobContext(
        this.context,
        parseWithSchema(this.declaration.input, input),
        progressReporter,
        signal,
        authority.entities,
      ),
      entityId,
      ai: this.generationAI(signal),
    } satisfies EntityGenerationContext<unknown>;
    const result = await this.declaration.generate(
      withEntityRuntime(generationContext, this.target.runtime(authority)),
    );
    if (!result.success) this.failEarly(result.error);

    // No more visible than what it was written from, as a projected entry
    // is, unless the generation says otherwise; and never more visible than
    // its requester may write.
    const fromSource = await this.sourceVisibility(source);
    const visibility =
      result.visibility ??
      (fromSource && morePrivate(allocated?.visibility, fromSource));
    const unwritable =
      visibility && authority.visibilityRefusal(this.entityType, visibility);
    if (unwritable) this.failEarly(unwritable);

    const link = result.linkInto;
    if (link) {
      const problem = await generationLinkProblem(
        this.context,
        link,
        authority,
      );
      if (problem) this.failEarly(problem);
    }
    const metadata: Record<string, unknown> = { ...result.metadata };
    const title =
      typeof metadata["title"] === "string" ? metadata["title"] : undefined;
    return {
      id: entityId ?? result.id ?? slugify(title ?? this.entityType),
      content: result.content,
      metadata,
      ...definedFields({
        title,
        resultExtras: result.resultExtras && { ...result.resultExtras },
      }),
      ...(link && { linkInto: link }),
      ...(visibility && { visibility }),
      // A generation that asks lands beside a record holding its id; one
      // filling an allocated entity keeps that entity.
      ...(entityId === undefined &&
        isDeduplicated(result) && { createOptions: { deduplicateId: true } }),
    };
  }

  protected override async afterCreate(
    _data: unknown,
    entityId: string,
    _progressReporter: ProgressReporter,
    generated: GeneratedContent,
  ): Promise<void> {
    if (isLinked(generated)) {
      await writeGenerationLink(
        this.context,
        entityId,
        generated.linkInto,
        this.currentRun().authority,
      );
    }
    await this.runStep({
      written: { entityId, ...definedFields({ title: generated.title }) },
    });
    if (this.target.reportsToPipeline) {
      await this.context.messaging.command(generateReportSuccessContract, {
        entityType: this.entityType,
        entityId,
      });
    }
  }

  protected override async onGenerationFailure(
    _data: unknown,
    error: string,
  ): Promise<void> {
    await this.runStep({ failed: error });
    if (this.target.reportsToPipeline) {
      await this.context.messaging.command(generateReportFailureContract, {
        entityType: this.entityType,
        error,
      });
    }
  }

  /**
   * The step a first-party generation carries after it runs, given the
   * input as its schema reads it and the package's jobs and retries.
   */
  private async runStep(outcome: GenerationOutcome): Promise<void> {
    const step = afterGenerationOf(this.declaration);
    const retries = this.target.retries;
    if (!step || !retries) return;
    const parsed = this.declaration.input.safeParse(
      this.runs.getStore()?.input,
    );
    await step({
      input: parsed.success ? parsed.data : undefined,
      outcome,
      messaging: this.context.messaging,
      jobs: this.context.jobs,
      retries,
    });
  }

  private generationAI(signal: AbortSignal): EntityGenerationAI {
    return createGenerationAI(this.context, this.target.template, signal);
  }

  /**
   * The most private visibility among the entries a generation is written
   * from. Only their visibility is read, so a source its requester cannot
   * see still keeps the output private; one that is gone limits nothing.
   */
  private async sourceVisibility(
    source: GenerationSource | undefined,
  ): Promise<ContentVisibility | undefined> {
    if (!source) return undefined;
    const entries = await Promise.all(
      source.ids.map((id) =>
        this.context.entityService.getEntity({
          entityType: source.entityType,
          id,
          visibilityScope: internalFullScope(
            "a generation is no more visible than its source; only the visibility is read",
          ),
        }),
      ),
    );
    return entries.reduce<ContentVisibility | undefined>(
      (held, entry) => (entry ? morePrivate(held, entry.visibility) : held),
      undefined,
    );
  }

  /** The generation `process` is running; the base handler calls back inside it. */
  private currentRun(): GenerationRun {
    const run = this.runs.getStore();
    if (!run) throw new Error(`${this.jobTypeName} ran outside its job`);
    return run;
  }
}
