import {
  canWriteVisibility,
  extractVisibilityFromMarkdown,
  permissionToVisibilityScope,
  resolveEntityOrError,
  type BaseEntity,
  type CreateCheckResult,
  type CreateInput,
} from "@brains/entity-service";
import { sharedUploadScope } from "@brains/plugins";
import { bufferView } from "@brains/utils/bytes";
import { markdownBody } from "@brains/utils/markdown-frontmatter";
import { generateMarkdown } from "@brains/utils/markdown";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { slugify } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import { createInputSchema } from "./schemas";
import { createModelInput, uneditableFieldsError } from "./field-changes";
import { systemToolsNeverWrite } from "./entity-action-policy";
import {
  admitCreate,
  confirmOrRun,
  runCreate,
  type CreateConfirmationRequest,
  type CreateInterceptor,
  type EntityRef,
} from "./entity-create-pipeline";
import {
  freezeUserMessageSource,
  resolveConversationMessageContent,
  type ConversationMessageRef,
  type UserMessageSource,
} from "./conversation-message-source";
import type { SystemServices } from "./types";
import {
  PendingCreateTexts,
  pendingCreateKey,
  retrySourceHint,
  type RetryResolution,
} from "./pending-create-text";
import {
  buildEntityMutationEventContext,
  createConfirmationGate,
  createExecutionContextFrom,
  createSystemTool,
  entityTypeRefusal,
  guardError,
  guardRefusal,
  hasStructuredFrontmatter,
  isUploadRefInConversation,
  normalizeOptionalString,
  resolveCreateTarget,
  type FailedCreateTarget,
  type Guarded,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";
import { isPlainRecord } from "@brains/utils/predicates";
import {
  isTextUploadMediaType,
  repeatsUploadFileName,
  uploadTitle,
} from "@brains/plugins";
import {
  createFromUploads,
  type PreparedUploadResult,
  type UploadItemRequest,
} from "./entity-create-uploads";

function buildUploadPreserveConfirmation(input: {
  title?: string;
  filename: string;
  mediaType: string;
  entityType: string;
  visibility: CreateInput["visibility"];
}): { summary: string; preview: string } {
  const label = input.title ? ` as "${input.title}"` : "";
  return {
    summary: `Save uploaded file${label}?`,
    preview: [
      `Filename: ${input.filename}`,
      `Media type: ${input.mediaType}`,
      `Entity type: ${input.entityType}`,
      `Visibility: ${input.visibility ?? "public"}`,
      ...(input.title ? [`Title: ${input.title}`] : []),
    ].join("\n"),
  };
}

/**
 * Reads entirely from the canonical createInput: `from` holds the upload ref,
 * and `content` the resolved text or conversation-message content.
 */
function buildCreateConfirmation(createInput: CreateInput): {
  summary: string;
  preview: string;
} {
  const { entityType, title, visibility, content, url, from, fields } =
    createInput;
  const label = title ? ` "${title}"` : ` ${entityType}`;
  const summary = `Create${label}?`;
  const previewParts = [
    `Entity type: ${entityType}`,
    `Visibility: ${visibility ?? "public"}`,
    ...(title ? [`Title: ${title}`] : []),
    ...(url ? [`URL: ${url}`] : []),
    ...(from?.kind === "upload" ? ["Upload: uploaded file"] : []),
    ...Object.entries(fields ?? {}).map(
      ([field, value]) =>
        `${field}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    ),
    ...(content ? [`Content preview: ${content.slice(0, 500)}`] : []),
  ];

  return { summary, preview: previewParts.join("\n") };
}

type CreateToolInput = z.infer<typeof createInputSchema>;

/** What a confirmed create reports it did: it saved, it did not generate. */
function buildCreateCompletionSummary(createInput: CreateInput): string {
  const label = createInput.title ? ` "${createInput.title}"` : "";
  return `Saved ${createInput.entityType}${label}.`;
}

type PreferredCreateSource = CreateToolInput["source"];

type UploadRef = Extract<NonNullable<CreateInput["from"]>, { kind: "upload" }>;

interface NormalizedCreateSource {
  content?: string;
  url?: string;
  from?: UploadRef;
  uploadRef?: UploadRef;
  conversationMessageRef?: ConversationMessageRef;
  entityRef?: EntityRef;
  transform?: CreateInput["transform"];
}

function normalizeCreateSource(
  source: PreferredCreateSource,
): NormalizedCreateSource {
  switch (source.kind) {
    case "text":
      return { content: source.content };
    case "url":
      return { url: source.url };
    case "upload": {
      const uploadRef = { kind: "upload" as const, id: source.id };
      return { from: uploadRef, uploadRef, transform: source.transform };
    }
    case "prior-response":
    case "user-message":
      return { conversationMessageRef: source };
    case "entity":
      return {
        entityRef: { entityType: source.entityType, entityId: source.entityId },
      };
    case "uploads":
      throw new Error("Several uploads are prepared one upload at a time");
  }
}

interface ResolvedEntitySource {
  ref: EntityRef;
  /** The source's Markdown body, without frontmatter. */
  content: string;
  title: string | undefined;
  visibility: BaseEntity["visibility"];
}

/** Read an existing entity's text, at the caller's visibility. */
async function resolveEntitySource(
  services: SystemServices,
  ref: EntityRef,
  toolContext: CreateToolContext,
): Promise<Guarded<ResolvedEntitySource>> {
  const result = await resolveEntityOrError(
    services.entityService,
    { entityType: ref.entityType, identifier: ref.entityId },
    {
      visibilityScope: permissionToVisibilityScope(
        toolContext.userPermissionLevel,
      ),
      logger: services.logger,
      label: "Source entity",
    },
  );
  if (!result.ok) return guardError(result.error);
  const { entity } = result;
  const content = markdownBody(entity.content, {
    trim: true,
    keepEmptyBlock: true,
  });
  if (!content) {
    return guardError(
      `Source entity ${entity.entityType}/${entity.id} has no text to use.`,
    );
  }
  const title = entity.metadata["title"];
  return {
    kind: "ok",
    value: {
      ref: { entityType: entity.entityType, entityId: entity.id },
      content,
      title: typeof title === "string" && title.trim() ? title : undefined,
      visibility: entity.visibility,
    },
  };
}

/**
 * The source a confirmation, or a question's retry hint, names: the source
 * pinned by an earlier question when a retry saves its text, else the
 * requested source frozen to the message or entity it resolved to.
 */
function freezeConfirmationSource(
  requested: PreferredCreateSource,
  { source, retry }: SourceWithRetry,
  content: string | undefined,
): PreferredCreateSource {
  if (retry.kind === "pinned") return retry.source;
  if (requested.kind === "user-message") {
    if (!source.resolvedMessageId || content === undefined) {
      throw new Error(
        "User-message source was not resolved before confirmation",
      );
    }
    return freezeUserMessageSource(requested, {
      messageId: source.resolvedMessageId,
      content,
      ...(source.resolvedUserSource && { source: source.resolvedUserSource }),
    });
  }
  if (requested.kind === "prior-response") {
    const messageId = requested.messageId ?? source.resolvedMessageId;
    return {
      kind: "prior-response",
      ...(messageId ? { messageId } : {}),
    };
  }
  if (requested.kind === "entity" && source.entitySource) {
    return { kind: "entity", ...source.entitySource.ref };
  }
  return requested;
}

type CreateToolContext = Parameters<Tool["handler"]>[1];
type CreateEventContext = ReturnType<typeof buildEntityMutationEventContext>;

/** Hand a kept upload to the plugin that saves its media type. */
async function executeUploadPreserve(
  input: {
    upload: { kind: "upload"; id: string };
    title?: string;
    visibility?: CreateInput["visibility"];
    handler: NonNullable<PreparedCreate["uploadPreserve"]>["handler"];
  },
  toolContext: CreateToolContext,
): Promise<ToolResponse> {
  const executionContext = createExecutionContextFrom(toolContext);
  return input.handler(
    {
      upload: input.upload,
      ...(input.title && { title: input.title }),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
    },
    executionContext,
  );
}

/**
 * Persist a content/text-source create directly, choosing markdown or raw
 * creation based on whether the entity type has structured frontmatter.
 */
async function executeDirectCreate(
  services: SystemServices,
  createInput: CreateInput,
  eventContext: CreateEventContext,
): Promise<ToolResponse> {
  const { entityService, entityRegistry } = services;
  const id = slugify(
    createInput.title ?? `${createInput.entityType}-${Date.now()}`,
  );
  const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
    createInput.entityType,
  );
  const structured =
    createInput.content !== undefined &&
    hasStructuredFrontmatter(frontmatterSchema);
  if (createInput.fields && !structured) {
    return {
      success: false,
      error: `${createInput.entityType} has no frontmatter to set fields on; save the text without fields.`,
    };
  }
  try {
    const createOptions = {
      deduplicateId: true,
      ...(eventContext ? { eventContext } : {}),
    };
    const result =
      createInput.content && structured
        ? await entityService.createEntityFromMarkdown({
            input: {
              entityType: createInput.entityType,
              id,
              markdown: createInput.fields
                ? generateMarkdown(createInput.fields, createInput.content)
                : createInput.content,
              ...(createInput.visibility !== undefined
                ? { visibility: createInput.visibility }
                : {}),
            },
            options: createOptions,
          })
        : await entityService.createEntity({
            entity: {
              id,
              entityType: createInput.entityType,
              content: createInput.content ?? "",
              metadata: { title: createInput.title ?? id },
              ...(createInput.visibility !== undefined
                ? { visibility: createInput.visibility }
                : {}),
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            },
            options: createOptions,
          });
    return {
      success: true,
      data: { entityId: result.entityId, status: "created" },
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, "Failed to create entity"),
    };
  }
}

interface PreparedCreate {
  createInput: CreateInput;
  /** The source the confirmation replays, frozen to what it resolved to. */
  confirmationSource: PreferredCreateSource;
  interceptor: CreateInterceptor;
  eventContext: CreateEventContext;
  /** The uploaded file's name, when the source is an upload. */
  uploadFilename?: string;
  /** The upload this create saves, named in its result. */
  uploadId?: string;
  /** The failed placeholder this create replaces once confirmed. */
  replacesFailed?: FailedCreateTarget;
  uploadPreserve?: {
    upload: UploadRef;
    filename: string;
    mediaType: string;
    handler: NonNullable<
      ReturnType<SystemServices["entityRegistry"]["getUploadSaveHandler"]>
    >["handler"];
  };
}

interface ResolvedCreateSource {
  /** Text content, with a prior-response ref already resolved to its message. */
  content: string | undefined;
  url: string | undefined;
  from: NormalizedCreateSource["from"];
  uploadRef: NormalizedCreateSource["uploadRef"];
  transform: NormalizedCreateSource["transform"];
  resolvedMessageId: string | undefined;
  resolvedUserSource: UserMessageSource | undefined;
  /** The existing entity whose text is the source, when it is one. */
  entitySource: ResolvedEntitySource | undefined;
}

/** Normalise the requested source and resolve a prior-response ref to its content. */
async function resolveCreateSource(
  services: SystemServices,
  input: CreateToolInput,
  toolContext: CreateToolContext,
): Promise<Guarded<ResolvedCreateSource>> {
  const {
    content,
    url,
    from,
    uploadRef,
    conversationMessageRef,
    entityRef,
    transform,
  } = normalizeCreateSource(input.source);
  const entitySource = entityRef
    ? await resolveEntitySource(services, entityRef, toolContext)
    : undefined;
  if (entitySource?.kind === "error") return entitySource;
  const resolvedMessage = conversationMessageRef
    ? await resolveConversationMessageContent(
        services,
        conversationMessageRef,
        toolContext,
        { confirmed: input.confirmed === true },
      )
    : undefined;
  if (resolvedMessage && !resolvedMessage.success) {
    return guardRefusal(resolvedMessage);
  }
  const resolvedContent =
    resolvedMessage?.success === true
      ? resolvedMessage.content
      : (entitySource?.value.content ?? content);

  if (transform === "extract-markdown" && !uploadRef) {
    return guardError('Transform "extract-markdown" requires an upload ref.');
  }
  if (!resolvedContent && !url && !from) {
    return guardError(
      'Provide `source` with kind "user-message", "text", "url", "prior-response", "upload", or "entity". Use system_generate for generated content or artifacts.',
    );
  }

  return {
    kind: "ok",
    value: {
      content: resolvedContent,
      url,
      from,
      uploadRef,
      transform,
      resolvedMessageId:
        resolvedMessage?.success === true
          ? resolvedMessage.messageId
          : undefined,
      resolvedUserSource:
        resolvedMessage?.success === true ? resolvedMessage.source : undefined,
      entitySource: entitySource?.value,
    },
  };
}

interface UploadSourceResolution {
  /** The entity type that will own the upload: the registered saver's for preserve, else the request's. */
  entityType: string;
  /** What the upload is saved as when the user gives no title. */
  title: string;
  filename: string;
  mediaType: string;
  /** A text upload's Markdown, read for transform extract-markdown. */
  markdown: string | undefined;
  uploadPreserve: PreparedCreate["uploadPreserve"];
}

/** The text of an upload whose bytes are text, to find its title in. */
async function readUploadMarkdown(
  services: SystemServices,
  upload: { id: string; mediaType: string },
): Promise<string | undefined> {
  if (!isTextUploadMediaType(upload.mediaType)) return undefined;
  const { content } = await services.runtimeUploads
    .scoped(sharedUploadScope)
    .read(upload.id);
  return bufferView(content).toString("utf8");
}

/**
 * Check the upload is reachable, name what it is saved as, and, for transform
 * "preserve", find the plugin that saves it.
 */
async function resolveUploadSource(
  services: SystemServices,
  input: {
    entityType: string;
    uploadRef: NonNullable<NormalizedCreateSource["uploadRef"]>;
    transform: NormalizedCreateSource["transform"];
  },
  toolContext: CreateToolContext,
): Promise<Guarded<UploadSourceResolution>> {
  const hasAccess = await isUploadRefInConversation(
    services,
    input.uploadRef,
    toolContext.conversationId ?? toolContext.channelId,
  );
  if (!hasAccess) {
    return guardError(
      "Upload ref is not accessible in this conversation or no longer exists.",
    );
  }
  let uploadRecord: { filename: string; mediaType: string };
  let markdown: string | undefined;
  try {
    uploadRecord = await services.runtimeUploads
      .scoped(sharedUploadScope)
      .readRecord(input.uploadRef.id);
    markdown =
      input.transform === "extract-markdown"
        ? await readUploadMarkdown(services, {
            id: input.uploadRef.id,
            mediaType: uploadRecord.mediaType,
          })
        : undefined;
  } catch {
    // A record or bytes the store cannot read is a ref that no longer resolves.
    return guardError("Upload ref not found");
  }
  const title = uploadTitle({ filename: uploadRecord.filename, markdown });
  if (input.transform !== "preserve") {
    return {
      kind: "ok",
      value: {
        entityType: input.entityType,
        title,
        filename: uploadRecord.filename,
        mediaType: uploadRecord.mediaType,
        markdown,
        uploadPreserve: undefined,
      },
    };
  }

  const registration = services.entityRegistry.getUploadSaveHandler(
    uploadRecord.mediaType,
  );
  if (!registration) {
    // Name the way out: told only that nothing preserves a text upload, a
    // model asked the user instead of importing it as a note.
    const asNote = isTextUploadMediaType(uploadRecord.mediaType)
      ? ' Keep a text upload as a note: entityType "note" with transform "extract-markdown".'
      : "";
    return guardError(
      `No installed plugin can save uploads with media type "${uploadRecord.mediaType}".${asNote}`,
    );
  }

  return {
    kind: "ok",
    value: {
      entityType: registration.entityType,
      title,
      filename: uploadRecord.filename,
      mediaType: uploadRecord.mediaType,
      markdown,
      uploadPreserve: {
        upload: input.uploadRef,
        filename: uploadRecord.filename,
        mediaType: uploadRecord.mediaType,
        handler: registration.handler,
      },
    },
  };
}

/**
 * Reconcile the requested visibility with any frontmatter declaration, then
 * check the caller may write at the effective level.
 */
function resolveCreateVisibility(
  requested: CreateToolInput["visibility"],
  content: string | undefined,
  toolContext: CreateToolContext,
): Guarded<CreateInput["visibility"] | undefined> {
  const fromSource = content
    ? extractVisibilityFromMarkdown(content)
    : undefined;
  if (
    requested !== undefined &&
    fromSource !== undefined &&
    requested !== fromSource
  ) {
    return guardError(
      `Conflicting entity visibility: system_create requested "${requested}" but the source frontmatter declares "${fromSource}".`,
    );
  }

  const declared = requested ?? fromSource;
  const effective = declared ?? "public";
  if (!canWriteVisibility(toolContext.userPermissionLevel, effective)) {
    return guardError(
      `Cannot create entity with visibility "${effective}" — caller permission "${toolContext.userPermissionLevel ?? "public"}" is not allowed to write at that level.`,
    );
  }
  return { kind: "ok", value: declared };
}

/**
 * Boundary: system_create makes NEW entities. If the derived id already
 * resolves to an existing entity, the caller almost certainly wants to
 * change that entity (status/title/fields) and misrouted to create.
 * Refuse with a self-documenting error pointing to system_update rather
 * than silently minting a deduplicated copy. `replace: true` is the
 * explicit opt-in for intentionally creating a new copy. This holds for
 * interceptor-backed types too: a note import or a portfolio project takes
 * its id from the title just like a direct create. A failed placeholder is
 * replaced instead (see resolveCreateTarget).
 */
function resolveCreateToolTarget(
  services: SystemServices,
  createInput: CreateInput,
  toolContext: CreateToolContext,
): Promise<Guarded<FailedCreateTarget | undefined>> {
  return resolveCreateTarget(
    services,
    {
      entityType: createInput.entityType,
      candidateId: createInput.title ? slugify(createInput.title) : undefined,
      replace: createInput.replace === true,
      copyHint: "create a new copy intentionally",
    },
    toolContext,
  );
}

type UploadTextSource = Pick<
  ResolvedCreateSource,
  "content" | "from" | "transform"
>;

/**
 * An upload imported with extract-markdown: a type that imports Markdown
 * (a note) reads the file itself, so the upload ref goes on; any other type
 * takes a text upload's text as its own, exactly as it takes pasted text.
 */
function resolveUploadText(
  services: SystemServices,
  entityType: string,
  source: UploadTextSource,
  upload: UploadSourceResolution | undefined,
): Guarded<UploadTextSource> {
  const registry = services.entityRegistry;
  if (
    source.transform !== "extract-markdown" ||
    !upload ||
    registry.getEntityTypeConfig(entityType).markdownImport
  ) {
    return { kind: "ok", value: source };
  }
  if (upload.markdown === undefined) {
    const importers = registry
      .getAllEntityTypes()
      .filter((type) => registry.getEntityTypeConfig(type).markdownImport);
    const importAs =
      importers.length > 0
        ? `Import it as a ${importers.join(" or ")}, or keep`
        : "Keep";
    return guardError(
      `A ${entityType} takes the text of a text upload; ${upload.filename} (${upload.mediaType}) is not text. ${importAs} the file itself with transform "preserve".`,
    );
  }
  return {
    kind: "ok",
    value: { content: upload.markdown, from: undefined, transform: undefined },
  };
}

/**
 * Run the type's check of a create before the user is asked to confirm it.
 * A check that fails is a refusal like any other guard's.
 */
async function runCreateCheck(
  services: SystemServices,
  createInput: CreateInput,
  toolContext: CreateToolContext,
): Promise<CreateCheckResult> {
  const check = services.entityRegistry.getCreateCheck(createInput.entityType);
  if (!check) return { kind: "ready" };
  try {
    return await check(createInput, createExecutionContextFrom(toolContext));
  } catch (error) {
    return {
      kind: "error",
      error: getErrorMessage(
        error,
        `Could not check the ${createInput.entityType}`,
      ),
    };
  }
}

/**
 * What the agent is told when the type needs an answer before the save can
 * be confirmed: the question to put to the user, as written, and how to
 * save the same text once they answer. The guidance is for the agent only.
 */
function askUserFirst(
  question: Extract<CreateCheckResult, { kind: "question" }>,
  source: PreferredCreateSource,
  several: SeveralUploads | undefined,
): string {
  return [
    "Nothing was saved and no approval was requested.",
    `Ask the user this question in your reply, as written, without mentioning tools or fields: "${question.question}"`,
    several
      ? `When they answer, call system_create again; to save the same files, pass source ${JSON.stringify(several.source)}, with the answer about this file in its item.`
      : `When they answer, call system_create again; to save the same text, pass source ${JSON.stringify(retrySourceHint(source))}.`,
    question.answerWith,
  ].join(" ");
}

/** The several-upload save a create is one file of. */
interface SeveralUploads {
  source: PreferredCreateSource;
}

/**
 * The create with what the type's check filled in: the title and fields
 * the confirmation shows. What the caller stated wins.
 */
function withCheckCompletions(
  createInput: CreateInput,
  ready: Extract<CreateCheckResult, { kind: "ready" }>,
): CreateInput {
  const fields = {
    ...Object.fromEntries(
      Object.entries(ready.fields ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ),
    ...createInput.fields,
  };
  const title = createInput.title ?? ready.title;
  return {
    ...createInput,
    ...(title && { title }),
    ...(Object.keys(fields).length > 0 && { fields }),
  };
}

/**
 * The refusal of a create with no text that neither the type's interceptor
 * nor an upload saver handles.
 */
const UNHANDLED_SOURCE_ERROR =
  'URL or upload source creation is supported only for entity types that explicitly handle it. Provide source kind "text" for this entity type, or use system_generate for generated content/artifacts.';

/** The resolved source, and whether a retry saves text an earlier question pinned. */
interface SourceWithRetry {
  source: ResolvedCreateSource;
  retry: RetryResolution;
}

/**
 * Resolve the requested source. A retry after a question saves the text
 * pinned when the question was asked: when the source it names no longer
 * resolves, or resolves to the model's own copy of that text.
 */
async function resolveSourceWithRetry(
  services: SystemServices,
  input: CreateToolInput,
  toolContext: CreateToolContext,
  pending: PendingCreateTexts,
  pendingKey: string | undefined,
): Promise<Guarded<SourceWithRetry>> {
  const resolved = await resolveCreateSource(services, input, toolContext);
  if (resolved.kind === "error") {
    const pinned = pendingKey
      ? pending.resolveUnresolvable(pendingKey, input.source)
      : undefined;
    if (!pinned) return resolved;
    return {
      kind: "ok",
      value: {
        source: {
          content: pinned.content,
          url: undefined,
          from: undefined,
          uploadRef: undefined,
          transform: undefined,
          resolvedMessageId: undefined,
          resolvedUserSource: undefined,
          entitySource: undefined,
        },
        retry: pinned,
      },
    };
  }
  const retry: RetryResolution = pendingKey
    ? pending.resolve(pendingKey, {
        source: input.source,
        content: resolved.value.content,
        resolvedMessageId: resolved.value.resolvedMessageId,
      })
    : { kind: "as-given" };
  return { kind: "ok", value: { source: resolved.value, retry } };
}

/** What a create saves, once its upload is read. */
interface CreateContent {
  /** The type it saves as: a kept upload's saver's, else the requested one. */
  entityType: string;
  content: string | undefined;
  from: UploadRef | undefined;
  transform: CreateInput["transform"];
  upload: UploadSourceResolution | undefined;
}

/**
 * Read the upload a create names, and settle the text it saves: the text a
 * retry keeps pinned, a text upload's own text, or the resolved source's.
 */
async function resolveCreateContent(
  services: SystemServices,
  input: CreateToolInput,
  { source, retry }: SourceWithRetry,
  toolContext: CreateToolContext,
): Promise<Guarded<CreateContent>> {
  const upload = source.uploadRef
    ? await resolveUploadSource(
        services,
        {
          entityType: input.entityType,
          uploadRef: source.uploadRef,
          transform: source.transform,
        },
        toolContext,
      )
    : undefined;
  if (upload?.kind === "error") return upload;
  const entityType = upload?.value.entityType ?? input.entityType;
  const uploadText = resolveUploadText(
    services,
    entityType,
    source,
    upload?.value,
  );
  if (uploadText.kind === "error") return uploadText;
  return {
    kind: "ok",
    value: {
      entityType,
      content:
        retry.kind === "pinned" ? retry.content : uploadText.value.content,
      from: uploadText.value.from,
      transform: uploadText.value.transform,
      upload: upload?.value,
    },
  };
}

/**
 * The create as the caller states it: at a visibility they may write, with
 * their fields, and titled as they say or as the source names itself.
 */
function stateCreateInput(
  input: CreateToolInput,
  { url, entitySource }: ResolvedCreateSource,
  { entityType, content, from, transform, upload }: CreateContent,
  toolContext: CreateToolContext,
): Guarded<CreateInput> {
  // Text taken from a non-public entity stays as private as its source
  // unless the caller asks for another level.
  const inheritedVisibility =
    entitySource && entitySource.visibility !== "public"
      ? entitySource.visibility
      : undefined;
  const visibility = resolveCreateVisibility(
    input.visibility ?? inheritedVisibility,
    content,
    toolContext,
  );
  if (visibility.kind === "error") return visibility;

  if (input.fields && "visibility" in input.fields) {
    return guardError(
      "Set visibility with the typed `visibility` input, not in `fields`.",
    );
  }
  const fields =
    input.fields && Object.keys(input.fields).length > 0
      ? input.fields
      : undefined;

  // A title that only repeats an upload's file name is the agent's echo of
  // the file, not one the user stated: the upload is named by its heading.
  const statedTitle = normalizeOptionalString(input.title);
  const title =
    (upload && repeatsUploadFileName(statedTitle, upload.filename)
      ? undefined
      : statedTitle) ??
    entitySource?.title ??
    upload?.title;
  const replace = input.replace === true;
  return {
    kind: "ok",
    value: {
      entityType,
      ...(title && { title }),
      ...(visibility.value !== undefined
        ? { visibility: visibility.value }
        : {}),
      ...(content && { content }),
      ...(url && { url }),
      ...(from && { from }),
      ...(transform && { transform }),
      ...(fields && { fields }),
      ...(replace && { replace }),
    },
  };
}

/**
 * Ask for what the type still needs before the confirmation, so the user
 * approves once, the complete save. A question goes back to the agent with
 * the text pinned, so the save after the answer keeps it unchanged whatever
 * the model resends.
 */
async function checkOrAsk(
  services: SystemServices,
  statedInput: CreateInput,
  toolContext: CreateToolContext,
  ask: {
    /** The source the retry passes to save the same text. */
    source: PreferredCreateSource;
    several: SeveralUploads | undefined;
    /** The text to pin; an upload is read again from its ref instead. */
    pinnable: string | undefined;
    pending: PendingCreateTexts;
    pendingKey: string | undefined;
  },
): Promise<Guarded<CreateInput>> {
  const checked = await runCreateCheck(services, statedInput, toolContext);
  if (checked.kind === "error") return guardError(checked.error);
  if (checked.kind === "question") {
    if (ask.pendingKey && ask.pinnable !== undefined) {
      ask.pending.pin(ask.pendingKey, {
        source: ask.source,
        content: ask.pinnable,
        question: checked.asks,
      });
    }
    return guardError(askUserFirst(checked, ask.source, ask.several));
  }
  return { kind: "ok", value: withCheckCompletions(statedInput, checked) };
}

/**
 * Resolve the source, run every input/policy guard, and build the canonical
 * `createInput`. Returns a structured error response on any guard failure, or
 * the prepared create with what the confirmation and execution still need.
 */
async function prepareCreate(
  services: SystemServices,
  input: CreateToolInput,
  toolContext: CreateToolContext,
  pending: PendingCreateTexts,
  several?: SeveralUploads,
): Promise<Guarded<PreparedCreate>> {
  // A kept upload's type is its saver's, known once the upload is read.
  const isUploadPreserve =
    input.source.kind === "upload" && input.source.transform === "preserve";
  if (!isUploadPreserve) {
    const unregistered = entityTypeRefusal(services, input.entityType);
    if (unregistered) return guardRefusal(unregistered);
  }

  const pendingKey = pendingCreateKey(
    toolContext.conversationId ?? toolContext.channelId,
    input.entityType,
  );
  const sourced = await resolveSourceWithRetry(
    services,
    input,
    toolContext,
    pending,
    pendingKey,
  );
  if (sourced.kind === "error") return sourced;
  const { source } = sourced.value;
  const resolved = await resolveCreateContent(
    services,
    input,
    sourced.value,
    toolContext,
  );
  if (resolved.kind === "error") return resolved;
  const { content, upload } = resolved.value;
  const uploadPreserve = upload?.uploadPreserve;
  const stated = stateCreateInput(input, source, resolved.value, toolContext);
  if (stated.kind === "error") return stated;
  const statedInput = stated.value;

  const admitted = admitCreate(services, statedInput.entityType, toolContext);
  if (admitted.kind === "error") return admitted;
  const { interceptor } = admitted.value;
  if (!statedInput.content && !interceptor && !uploadPreserve) {
    return guardError(UNHANDLED_SOURCE_ERROR);
  }

  const confirmationSource = freezeConfirmationSource(
    input.source,
    sourced.value,
    content,
  );
  // The approved call was checked already; a kept upload has no check.
  const checked =
    input.confirmed || uploadPreserve
      ? { kind: "ok" as const, value: statedInput }
      : await checkOrAsk(services, statedInput, toolContext, {
          source: confirmationSource,
          several,
          pinnable: source.uploadRef ? undefined : content,
          pending,
          pendingKey,
        });
  if (checked.kind === "error") return checked;
  const createInput = checked.value;

  const target = await resolveCreateToolTarget(
    services,
    createInput,
    toolContext,
  );
  if (target.kind === "error") return target;

  return {
    kind: "ok",
    value: {
      createInput,
      confirmationSource,
      interceptor,
      eventContext: buildEntityMutationEventContext(toolContext),
      ...(upload && { uploadFilename: upload.filename }),
      ...(source.uploadRef && { uploadId: source.uploadRef.id }),
      ...(target.value && { replacesFailed: target.value }),
      ...(uploadPreserve && { uploadPreserve }),
    },
  };
}

/**
 * Run a prepared create once it is confirmed. A saved upload's result names
 * the upload and the entity it became, so a later turn knows the file is kept.
 */
async function executePreparedCreate(
  services: SystemServices,
  prepared: PreparedCreate,
  toolContext: CreateToolContext,
  pending: PendingCreateTexts,
): Promise<ToolResponse> {
  const result = await runPreparedCreate(
    services,
    prepared,
    toolContext,
    pending,
  );
  const { uploadId } = prepared;
  if (uploadId === undefined || !("success" in result) || !result.success)
    return result;
  if (!isPlainRecord(result.data)) return result;
  return {
    ...result,
    data: {
      entityType: prepared.createInput.entityType,
      ...result.data,
      uploadId,
    },
  };
}

async function runPreparedCreate(
  services: SystemServices,
  prepared: PreparedCreate,
  toolContext: CreateToolContext,
  pending: PendingCreateTexts,
): Promise<ToolResponse> {
  const { createInput, eventContext, uploadPreserve, replacesFailed } =
    prepared;
  if (uploadPreserve) {
    // A kept upload goes to its saver, not through the type's interceptor.
    return runCreate(services, toolContext, {
      createInput,
      interceptor: undefined,
      replacesFailed,
      persist: () =>
        executeUploadPreserve(
          {
            upload: uploadPreserve.upload,
            ...(createInput.title && { title: createInput.title }),
            ...(createInput.visibility !== undefined
              ? { visibility: createInput.visibility }
              : {}),
            handler: uploadPreserve.handler,
          },
          toolContext,
        ),
    });
  }

  const result = await runCreate(services, toolContext, {
    createInput,
    interceptor: prepared.interceptor,
    replacesFailed,
    persist: async (input) =>
      input.content
        ? executeDirectCreate(services, input, eventContext)
        : { success: false, error: UNHANDLED_SOURCE_ERROR },
  });
  // A saved create ends the question its text was pinned for.
  const pendingKey = pendingCreateKey(
    toolContext.conversationId ?? toolContext.channelId,
    createInput.entityType,
  );
  if (pendingKey && "success" in result && result.success) {
    pending.clear(pendingKey);
  }
  return result;
}

/** Prepare one file of a several-upload save exactly as a single upload. */
async function prepareUploadItem(
  services: SystemServices,
  input: CreateToolInput,
  item: UploadItemRequest,
  toolContext: CreateToolContext,
  pending: PendingCreateTexts,
): Promise<PreparedUploadResult> {
  const fields = { ...input.fields, ...item.fields };
  const prep = await prepareCreate(
    services,
    {
      entityType: input.entityType,
      ...(item.title !== undefined ? { title: item.title } : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      source: {
        kind: "upload",
        id: item.id,
        transform: item.transform,
      },
      ...(Object.keys(fields).length > 0 && { fields }),
      ...(input.replace !== undefined ? { replace: input.replace } : {}),
      ...(input.confirmed && { confirmed: input.confirmed }),
    },
    toolContext,
    pending,
    { source: input.source },
  );
  if (prep.kind === "error") return prep;
  const prepared = prep.value;
  return {
    kind: "ok",
    value: {
      filename: prepared.uploadFilename ?? item.id,
      entityType: prepared.createInput.entityType,
      title: prepared.createInput.title ?? prepared.uploadFilename ?? "",
      ...(prepared.createInput.fields && {
        fields: prepared.createInput.fields,
      }),
      ...(prepared.replacesFailed && {
        replacesFailed: `${prepared.replacesFailed.entityType} "${prepared.replacesFailed.id}"`,
      }),
      save: () =>
        executePreparedCreate(services, prepared, toolContext, pending),
    },
  };
}

/** The confirmation a prepared create asks for, and the call it replays. */
function createConfirmationRequest(
  prepared: PreparedCreate,
): CreateConfirmationRequest {
  const { createInput, uploadPreserve } = prepared;
  const { summary, preview } = uploadPreserve
    ? buildUploadPreserveConfirmation({
        ...(createInput.title && { title: createInput.title }),
        filename: uploadPreserve.filename,
        mediaType: uploadPreserve.mediaType,
        entityType: createInput.entityType,
        visibility: createInput.visibility,
      })
    : buildCreateConfirmation(createInput);
  return {
    toolName: "system_create",
    summary,
    completionSummary: buildCreateCompletionSummary(createInput),
    preview,
    args: {
      entityType: createInput.entityType,
      ...(createInput.title && { title: createInput.title }),
      ...(createInput.visibility !== undefined
        ? { visibility: createInput.visibility }
        : {}),
      source: prepared.confirmationSource,
      ...(createInput.fields && { fields: createInput.fields }),
      ...(createInput.replace && { replace: createInput.replace }),
    },
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const confirmationGate = createConfirmationGate({
    label: "create",
    requestNoun: "creation",
  });
  const pending = new PendingCreateTexts();

  const tool = createSystemTool(
    "create",
    "Create a new entity from existing material. Never create a duplicate to save edits: use system_update for entities already created or imported in this conversation, even while an upload import is generating. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. Use visibility shared for team/collaborator content such as a team note, restricted for private/admin-only content, and omit it for public content; keep visibility separate from exact source text. Public callers may write only public content, Trusted callers public or shared, and Admin callers all three. If the user only says 'not public' without saying team/shared or private/admin-only, ask which scope they mean. Entity-specific instructions may direct proactive capture of the user's request itself; in that case the request is concrete text and no separate save verb is required. Use system_generate for AI generation, generated images, cover images, and source-derived artifacts such as carousel/printable PDFs or OG images. If the user includes content in the same direct save request, use source.kind user-message, omitting messageId for the latest user message; that content is sufficient even when it is a short sentence or fragment after a colon or embedded in the request phrase (for example, 'Save this memo about the launch timeline'), so never ask the user to paste it again. For standalone delimiter lines, use boundaryMode lines with startAfter/endBefore set to the exact marker line text WITHOUT newline characters; the server preserves all intervening bytes, including final newlines. To save a pasted document that opens with --- frontmatter, use boundaryMode frontmatter without startAfter or endBefore: the server selects it from its opening fence, and the fences are content, never boundaries. For inline content, use literal startAfter/endBefore boundaries to exclude the save instruction. Omit boundaries only when saving the whole message. Never retype, shorten, correct, or include delimiter text in pasted source material, and never ask for a smaller copy just because it is long. For 'Save this as a note: ...', startAfter can be the exact 'Save this as a note: ' prefix. If boundaries are ambiguous, ask for clarification. If the user says save it/that/this after your immediately preceding upload summary/answer, use entityType note with source.kind prior-response unless they explicitly ask to save the uploaded file/document itself; do this even when the prior answer says there was limited readable content, and do not ask whether they meant the summary or the file after you just summarized/answered about the upload. A bare upload receipt like 'I got filename. What would you like me to do?' is not a summary/answer: for a following 'save it', preserve the latest uploaded file itself with upload transform preserve (image uploads as entityType image). Only use source.kind upload when the runtime supplies an actual upload reference/attachment, and then use it even though the file text also appears in the message; only a pasted uploaded-file transcript (for example, User uploaded a file \"name.md\": ...) with no listed upload ref is saved with source.kind user-message boundaries.",
    createInputSchema,
    async (input, toolContext) => {
      // Grouping fields come from a definitions entity, read when first
      // needed: read them before checking which fields a caller may set.
      await services.entityRegistry.ensureGroupingsCurrent(input.entityType);
      // Visibility has its own parameter and its own refusal below.
      const uneditable = [
        input.fields,
        ...(input.source.kind === "uploads"
          ? input.source.items.map((item) => item.fields)
          : []),
      ]
        .map((fields) =>
          uneditableFieldsError(
            services.entityRegistry,
            input.entityType,
            fields,
            { on: "create", allow: ["visibility"] },
          ),
        )
        .find((error) => error !== undefined);
      if (uneditable) return { success: false, error: uneditable };
      if (input.source.kind === "uploads") {
        return createFromUploads({
          input: { ...input, source: input.source },
          gate: confirmationGate,
          prepare: (item) =>
            prepareUploadItem(services, input, item, toolContext, pending),
        });
      }
      const prep = await prepareCreate(services, input, toolContext, pending);
      if (prep.kind === "error") return prep.result;
      const prepared = prep.value;
      return confirmOrRun({
        gate: confirmationGate,
        input,
        replacesFailed: prepared.replacesFailed,
        confirmation: () => createConfirmationRequest(prepared),
        run: () =>
          executePreparedCreate(services, prepared, toolContext, pending),
      });
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
  // The model writes field changes as a list, which strict mode can hold.
  return {
    ...tool,
    modelInput: createModelInput(
      services.entityRegistry,
      systemToolsNeverWrite(services.permissionService),
    ),
  };
}
