import { AsyncLocalStorage } from "node:async_hooks";
import {
  fetchVoiceGuidance,
  generateReportFailureContract,
  generateReportSuccessContract,
} from "@brains/contracts";
import {
  canonicalContentVisibilitySchema,
  internalFullScope,
} from "@brains/entity-service";
import type { JobHandler } from "@brains/job-queue";
import { parseMarkdown, updateFrontmatterField } from "@brains/utils/markdown";
import { parseWithSchema } from "@brains/utils/parse-schema";
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
import type { EntityPluginContext } from "./context";
import type {
  EntityEvalFixtures,
  EntityGenerationAI,
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationLink,
  EntityJobContext,
  EntityJobDeclaration,
  EntityJobMessaging,
  EntityJobProgress,
} from "./entity-definition-contract";
import { createEntityReader } from "./entity-reader";
import { waitForEmbeddingsToDrain } from "./embedding-drain";

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

/** The parts of a job's context every declared job shares, frozen. */
function jobContext<TInput>(
  context: EntityPluginContext,
  input: TInput,
  progress: ProgressReporter,
  signal: AbortSignal,
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
    // Jobs run as the package, as declarative service jobs do.
    entities: createEntityReader(
      context.entityService,
      internalFullScope("declared entity jobs read as their package"),
    ),
    messaging,
    progress: reporter,
    signal,
  });
}

/** Bind a declared job that does its own work. */
export function entityJobHandler(
  declaration: EntityJobDeclaration,
  context: EntityPluginContext,
): JobHandler<string, unknown, unknown> {
  return {
    validateAndParse(data): unknown | null {
      const parsed = declaration.input.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    process: (input, _jobId, progress, signal): Promise<unknown> =>
      declaration.handle(jobContext(context, input, progress, signal)),
  };
}

/**
 * Why a link cannot be made, checked before anything is saved: a missing
 * target, or a cover on a type that never declared one — the same refusal
 * `system_update` makes.
 */
export async function generationLinkProblem(
  context: EntityPluginContext,
  link: EntityGenerationLink,
): Promise<string | undefined> {
  const target = await context.entityService.getEntity({
    entityType: link.entityType,
    id: link.entityId,
    visibilityScope: internalFullScope("generation checks its link target"),
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
): Promise<void> {
  // As stored, so the target is written back with its own references rather
  // than their resolved data.
  const target = await context.entityService.getEntityRaw({
    entityType: link.entityType,
    id: link.entityId,
    visibilityScope: internalFullScope("generation links into its target"),
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
  readonly retries?: RetryScope | undefined;
  /** Tell the content pipeline how each run went: the type is scheduled. */
  readonly reportsToPipeline?: boolean | undefined;
}

/**
 * A declared generation on main's generation lifecycle: the base handler
 * fills a pre-allocated stub (keeping edits made while it generated), marks
 * it failed on refusal, error or terminal failure, and creates the entity
 * when nothing was allocated. This class only supplies the declared
 * `generate` and the link write.
 */
export class DeclarativeGenerationHandler extends BaseGenerationJobHandler<unknown> {
  private readonly signals = new AsyncLocalStorage<AbortSignal>();
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

  override process(
    data: unknown,
    jobId: string,
    progressReporter: ProgressReporter,
    signal?: AbortSignal,
  ): ReturnType<BaseGenerationJobHandler<unknown>["process"]> {
    return this.signals.run(signal ?? new AbortController().signal, () =>
      super.process(data, jobId, progressReporter),
    );
  }

  protected async generate(
    data: unknown,
    progressReporter: ProgressReporter,
  ): Promise<GeneratedContent> {
    const signal = this.signals.getStore() ?? new AbortController().signal;
    const entityId = allocatedEntityId(data);
    const result = await this.declaration.generate(
      Object.freeze({
        ...jobContext(this.context, data, progressReporter, signal),
        entityId,
        ai: this.generationAI(signal),
      }) satisfies EntityGenerationContext<unknown>,
    );
    if (!result.success) this.failEarly(result.error);

    const link = result.linkInto;
    if (link) {
      const problem = await generationLinkProblem(this.context, link);
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
    };
  }

  protected override async afterCreate(
    _data: unknown,
    entityId: string,
    _progressReporter: ProgressReporter,
    generated: GeneratedContent,
  ): Promise<void> {
    if (isLinked(generated)) {
      await writeGenerationLink(this.context, entityId, generated.linkInto);
    }
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
    if (this.target.reportsToPipeline) {
      await this.context.messaging.command(generateReportFailureContract, {
        entityType: this.entityType,
        error,
      });
    }
  }

  private generationAI(signal: AbortSignal): EntityGenerationAI {
    return createGenerationAI(this.context, this.target.template, signal);
  }
}
