import {
  canWriteVisibility,
  extractVisibilityFromMarkdown,
  markdownBody,
  permissionToVisibilityScope,
  resolveEntityOrError,
  type BaseEntity,
  type CreateExecutionContext,
  type CreateInput,
} from "@brains/entity-service";
import { generateMarkdown } from "@brains/utils/markdown";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { slugify } from "@brains/utils/string-utils";
import type { z } from "@brains/utils/zod";
import { createInputSchema } from "./schemas";
import { assertEntityActionAllowed } from "./entity-action-policy";
import {
  freezeUserMessageSource,
  resolveConversationMessageContent,
  type ConversationMessageRef,
} from "./conversation-message-source";
import type { SystemServices } from "./types";
import {
  assertEntityTypeRegistered,
  buildEntityMutationEventContext,
  createConfirmationGate,
  createSystemTool,
  hasStructuredFrontmatter,
  isUploadRefInConversation,
  normalizeOptionalString,
  runCreateInterceptor,
} from "./tool-helpers";
import { getErrorMessage } from "@brains/utils/error";
import { isTextUploadMediaType, uploadTitle } from "@brains/plugins";
import {
  createFromUploads,
  type PreparedUploadResult,
  type UploadItemRequest,
} from "./entity-create-uploads";

// Reads entirely from the canonical createInput: the resolved source
// attachment is already baked into `from` by normalizeCreateSource, and
// `content` already holds the resolved text or conversation-message content.
const uploadScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

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

function buildCreateConfirmation(createInput: CreateInput): {
  summary: string;
  preview: string;
} {
  const { entityType, title, visibility, prompt, content, url, from, fields } =
    createInput;
  const label = title ? ` "${title}"` : ` ${entityType}`;
  const summary = `${prompt ? "Generate" : "Create"}${label}?`;
  const sourceAttachment =
    from?.kind === "entity-attachment" ? from : undefined;
  const previewParts = [
    `Entity type: ${entityType}`,
    `Visibility: ${visibility ?? "public"}`,
    ...(title ? [`Title: ${title}`] : []),
    ...(url ? [`URL: ${url}`] : []),
    ...(from?.kind === "upload" ? ["Upload: uploaded file"] : []),
    ...(sourceAttachment
      ? [
          `Source attachment: ${sourceAttachment.sourceEntityType}/${sourceAttachment.sourceEntityId} (${sourceAttachment.attachmentType})`,
        ]
      : []),
    ...(prompt ? [`Prompt: ${prompt}`] : []),
    ...Object.entries(fields ?? {}).map(
      ([field, value]) =>
        `${field}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    ),
    ...(content ? [`Content preview: ${content.slice(0, 500)}`] : []),
  ];

  return { summary, preview: previewParts.join("\n") };
}

type CreateToolInput = z.infer<typeof createInputSchema>;

type PreferredCreateSource = CreateToolInput["source"];

interface EntitySourceRef {
  entityType: string;
  entityId: string;
}

interface NormalizedCreateSource {
  content?: string;
  url?: string;
  from?: Exclude<CreateInput["from"], { kind: "conversation-message" }>;
  uploadRef?: { kind: "upload"; id: string };
  conversationMessageRef?: ConversationMessageRef;
  entityRef?: EntitySourceRef;
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
    case "upload":
      return {
        from: source.upload,
        uploadRef: source.upload,
        transform: source.transform,
      };
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
  ref: EntitySourceRef;
  /** The source's Markdown body, without frontmatter. */
  content: string;
  title: string | undefined;
  visibility: BaseEntity["visibility"];
}

/** Read an existing entity's text, at the caller's visibility. */
async function resolveEntitySource(
  services: SystemServices,
  ref: EntitySourceRef,
  toolContext: CreateToolContext,
): Promise<Guarded<ResolvedEntitySource>> {
  const result = await resolveEntityOrError(
    services.entityService,
    ref.entityType,
    ref.entityId,
    services.logger,
    "Source entity",
    permissionToVisibilityScope(toolContext.userPermissionLevel),
  );
  if (!result.ok) return guardError(result.error);
  const { entity } = result;
  const content = markdownBody(entity.content);
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

function freezeConfirmationSource(input: {
  source: PreferredCreateSource;
  resolvedMessageId?: string;
  resolvedEntity?: EntitySourceRef;
  content?: string;
}): PreferredCreateSource {
  if (input.source.kind === "user-message") {
    if (!input.resolvedMessageId || input.content === undefined) {
      throw new Error(
        "User-message source was not resolved before confirmation",
      );
    }
    return freezeUserMessageSource(input.source, {
      messageId: input.resolvedMessageId,
      content: input.content,
    });
  }
  if (input.source.kind === "prior-response") {
    const messageId = input.source.messageId ?? input.resolvedMessageId;
    return {
      kind: "prior-response",
      ...(messageId ? { messageId } : {}),
    };
  }
  if (input.source.kind === "entity" && input.resolvedEntity) {
    return { kind: "entity", ...input.resolvedEntity };
  }
  return input.source;
}

type CreateToolContext = Parameters<Tool["handler"]>[1];
type CreateEventContext = ReturnType<typeof buildEntityMutationEventContext>;

/**
 * Persist a content/text-source create directly, choosing markdown or raw
 * creation based on whether the entity type has structured frontmatter.
 */
async function executeUploadPreserve(
  input: {
    upload: { kind: "upload"; id: string };
    title?: string;
    visibility?: CreateInput["visibility"];
    handler: NonNullable<PreparedCreate["uploadPreserve"]>["handler"];
  },
  toolContext: CreateToolContext,
): Promise<ToolResponse> {
  const executionContext: CreateExecutionContext = {
    interfaceType: toolContext.interfaceType,
    actor: toolContext.actor,
    ...(toolContext.channelId && { channelId: toolContext.channelId }),
    ...(toolContext.channelName && {
      channelName: toolContext.channelName,
    }),
  };
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
  resolvedMessageId: string | undefined;
  resolvedEntity?: EntitySourceRef;
  interceptor: ReturnType<
    SystemServices["entityRegistry"]["getCreateInterceptor"]
  >;
  eventContext: CreateEventContext;
  /** The uploaded file's name, when the source is an upload. */
  uploadFilename?: string;
  uploadPreserve?: {
    upload: { kind: "upload"; id: string };
    filename: string;
    mediaType: string;
    handler: NonNullable<
      ReturnType<SystemServices["entityRegistry"]["getUploadSaveHandler"]>
    >["handler"];
  };
}

type Guarded<T> =
  { kind: "error"; result: ToolResponse } | { kind: "ok"; value: T };

function guardError(error: string): { kind: "error"; result: ToolResponse } {
  return { kind: "error", result: { success: false, error } };
}

interface ResolvedCreateSource {
  /** Text content, with a prior-response ref already resolved to its message. */
  content: string | undefined;
  url: string | undefined;
  from: NormalizedCreateSource["from"];
  uploadRef: NormalizedCreateSource["uploadRef"];
  transform: NormalizedCreateSource["transform"];
  resolvedMessageId: string | undefined;
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
    return { kind: "error", result: resolvedMessage };
  }
  const resolvedContent =
    resolvedMessage?.success === true
      ? resolvedMessage.content
      : (entitySource?.value.content ?? content);

  if (
    transform === "extract-markdown" &&
    (!uploadRef ||
      !services.entityRegistry.getEntityTypeConfig(input.entityType)
        .markdownImport)
  ) {
    const available = services.entityRegistry
      .getAllEntityTypes()
      .filter(
        (type) =>
          services.entityRegistry.getEntityTypeConfig(type).markdownImport,
      );
    return guardError(
      `Transform "extract-markdown" requires an upload ref and a type declaring markdownImport. Available: ${available.join(", ") || "none"}. Omit transform for raw file promotion.`,
    );
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
  uploadPreserve: PreparedCreate["uploadPreserve"];
}

/** The text of an upload whose bytes are text, to find its title in. */
async function readUploadMarkdown(
  services: SystemServices,
  upload: { id: string; mediaType: string },
): Promise<string | undefined> {
  if (!isTextUploadMediaType(upload.mediaType)) return undefined;
  const { content } = await services.runtimeUploads
    .scoped(uploadScope)
    .read(upload.id);
  return content.toString("utf8");
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
      .scoped(uploadScope)
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
        uploadPreserve: undefined,
      },
    };
  }

  const registration = services.entityRegistry.getUploadSaveHandler(
    uploadRecord.mediaType,
  );
  if (!registration) {
    return guardError(
      `No installed plugin can save uploads with media type "${uploadRecord.mediaType}".`,
    );
  }

  return {
    kind: "ok",
    value: {
      entityType: registration.entityType,
      title,
      filename: uploadRecord.filename,
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
 * its id from the title just like a direct create.
 */
async function assertCreateTargetIsNew(
  services: SystemServices,
  createInput: CreateInput,
): Promise<ToolResponse | undefined> {
  if (createInput.replace) return undefined;
  const candidateId = createInput.title
    ? slugify(createInput.title)
    : undefined;
  if (!candidateId) return undefined;
  const existing = await services.entityService.getEntity({
    entityType: createInput.entityType,
    id: candidateId,
  });
  if (!existing) return undefined;
  return {
    success: false,
    error: `A ${createInput.entityType} already exists for "${candidateId}". To change its fields or status, use system_update; pass replace:true to create a new copy intentionally.`,
  };
}

/**
 * Resolve the source, run every input/policy guard, and build the canonical
 * `createInput`. Returns a structured error response on any guard failure, or
 * the prepared create plus the small resolution metadata (source attachment,
 * resolved message id) that the confirmation/execution phases still need.
 */
async function prepareCreate(
  services: SystemServices,
  input: CreateToolInput,
  toolContext: CreateToolContext,
): Promise<
  | { kind: "error"; result: ToolResponse }
  | { kind: "ok"; prepared: PreparedCreate }
> {
  const isUploadPreserve =
    input.source.kind === "upload" && input.source.transform === "preserve";
  if (!isUploadPreserve) {
    const unregisteredError = assertEntityTypeRegistered(
      services,
      input.entityType,
    );
    if (unregisteredError) return { kind: "error", result: unregisteredError };
  }

  const source = await resolveCreateSource(services, input, toolContext);
  if (source.kind === "error") return source;
  const {
    content,
    url,
    from,
    uploadRef,
    transform,
    resolvedMessageId,
    entitySource,
  } = source.value;

  const upload = uploadRef
    ? await resolveUploadSource(
        services,
        { entityType: input.entityType, uploadRef, transform },
        toolContext,
      )
    : undefined;
  if (upload?.kind === "error") return upload;
  const entityType = upload?.value.entityType ?? input.entityType;
  const uploadPreserve = upload?.value.uploadPreserve;

  const unregisteredDerivedError = assertEntityTypeRegistered(
    services,
    entityType,
  );
  if (unregisteredDerivedError) {
    return { kind: "error", result: unregisteredDerivedError };
  }

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

  const title =
    normalizeOptionalString(input.title) ??
    entitySource?.title ??
    upload?.value.title;
  const replace = input.replace === true;
  const createInput: CreateInput = {
    entityType,
    ...(title && { title }),
    ...(visibility.value !== undefined ? { visibility: visibility.value } : {}),
    ...(content && { content }),
    ...(url && { url }),
    ...(from && { from }),
    ...(transform && { transform }),
    ...(fields && { fields }),
    ...(replace && { replace }),
  };

  const policyError = assertEntityActionAllowed(
    services,
    createInput.entityType,
    "create",
    toolContext,
  );
  if (policyError) return { kind: "error", result: policyError };

  const interceptor = services.entityRegistry.getCreateInterceptor(
    createInput.entityType,
  );
  if (!createInput.content && !interceptor && !uploadPreserve) {
    return guardError(
      'URL or upload source creation is supported only for entity types that explicitly handle it. Provide source kind "text" for this entity type, or use system_generate for generated content/artifacts.',
    );
  }

  const existingError = await assertCreateTargetIsNew(services, createInput);
  if (existingError) return { kind: "error", result: existingError };

  return {
    kind: "ok",
    prepared: {
      createInput,
      resolvedMessageId,
      ...(entitySource && { resolvedEntity: entitySource.ref }),
      interceptor,
      eventContext: buildEntityMutationEventContext(toolContext),
      ...(upload && { uploadFilename: upload.value.filename }),
      ...(uploadPreserve && { uploadPreserve }),
    },
  };
}

/** Run a prepared create once it is confirmed. */
async function executePreparedCreate(
  services: SystemServices,
  prepared: PreparedCreate,
  toolContext: CreateToolContext,
): Promise<ToolResponse> {
  const { interceptor, eventContext, uploadPreserve } = prepared;
  let { createInput } = prepared;
  if (uploadPreserve) {
    return executeUploadPreserve(
      {
        upload: uploadPreserve.upload,
        ...(createInput.title && { title: createInput.title }),
        ...(createInput.visibility !== undefined
          ? { visibility: createInput.visibility }
          : {}),
        handler: uploadPreserve.handler,
      },
      toolContext,
    );
  }
  if (interceptor) {
    const outcome = await runCreateInterceptor(
      services,
      interceptor,
      createInput,
      toolContext,
    );
    if (outcome.kind === "handled" || outcome.kind === "error") {
      return outcome.result;
    }
    createInput = outcome.createInput;
  }

  if (!createInput.content) {
    return {
      success: false,
      error:
        'URL or upload source creation is supported only for entity types that explicitly handle it. Provide source kind "text" for this entity type, or use system_generate for generated content/artifacts.',
    };
  }

  return executeDirectCreate(services, createInput, eventContext);
}

/** Prepare one file of a several-upload save exactly as a single upload. */
async function prepareUploadItem(
  services: SystemServices,
  input: CreateToolInput,
  item: UploadItemRequest,
  toolContext: CreateToolContext,
): Promise<PreparedUploadResult> {
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
        upload: item.upload,
        transform: item.transform,
      },
      ...(input.replace !== undefined ? { replace: input.replace } : {}),
    },
    toolContext,
  );
  if (prep.kind === "error") return prep;
  const { prepared } = prep;
  return {
    kind: "ok",
    value: {
      filename: prepared.uploadFilename ?? item.upload.id,
      entityType: prepared.createInput.entityType,
      title: prepared.createInput.title ?? prepared.uploadFilename ?? "",
      save: () => executePreparedCreate(services, prepared, toolContext),
    },
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const confirmationGate = createConfirmationGate({
    label: "create",
    requestNoun: "creation",
  });

  return createSystemTool(
    "create",
    "Create a new entity from existing material. Never create a duplicate to save edits: use system_update for entities already created or imported in this conversation, even while an upload import is generating. Requires confirmation; call this tool without confirmed to request that confirmation instead of asking for plain-text approval. Use visibility shared for team/collaborator content, restricted for private/admin-only content, and omit it for public content; keep visibility separate from exact source text. Use source to choose exactly one concrete source: user-message for verbatim content already pasted in this conversation (the server extracts the stored text without model copying), text for literal content without a stored message source, url for URL-first flows, prior-response for saving a previous assistant response, or upload with transform extract-markdown to import text into a note or transform preserve to save raw uploaded bytes as their durable file entity; uploads keeps several uploaded files in one call. Entity-specific instructions may direct proactive capture of the user's request itself; in that case the request is concrete text and no separate save verb is required. Use system_generate for AI generation, generated images, cover images, and source-derived artifacts such as carousel/printable PDFs or OG images. If the user includes content in the same direct save request, use source.kind user-message, omitting messageId for the latest user message. For standalone delimiter lines, use boundaryMode lines with startAfter/endBefore set to the exact marker line text WITHOUT newline characters; the server preserves all intervening bytes, including final newlines. To save a pasted document that opens with --- frontmatter, use boundaryMode frontmatter without startAfter or endBefore: the server selects it from its opening fence, and the fences are content, never boundaries. For inline content, use literal startAfter/endBefore boundaries to exclude the save instruction. Omit boundaries only when saving the whole message. Never retype, shorten, correct, or include delimiter text in pasted source material, and never ask for a smaller copy just because it is long. For 'Save this as a note: ...', startAfter can be the exact 'Save this as a note: ' prefix. If boundaries are ambiguous, ask for clarification. If the user says save it/that/this after your immediately preceding upload summary/answer, use entityType note with source.kind prior-response unless they explicitly ask to save the uploaded file/document itself; do this even when the prior answer says there was limited readable content, and do not ask whether they meant the summary or the file after you just summarized/answered about the upload. A bare upload receipt like 'I got filename. What would you like me to do?' is not a summary/answer: for a following 'save it', preserve the latest uploaded file itself with upload transform preserve (image uploads as entityType image). Only use source.kind upload when the runtime supplies an actual upload reference/attachment; if the user message merely contains a pasted uploaded-file transcript with readable content, use source.kind user-message with boundaries selecting that visible content. On the initial create request, do not pass confirmed; the tool will return confirmation args after the user confirms.",
    createInputSchema,
    async (input, toolContext) => {
      if (input.source.kind === "uploads") {
        return createFromUploads({
          input: { ...input, source: input.source },
          gate: confirmationGate,
          prepare: (item) =>
            prepareUploadItem(services, input, item, toolContext),
        });
      }
      const prep = await prepareCreate(services, input, toolContext);
      if (prep.kind === "error") return prep.result;
      const { createInput } = prep.prepared;
      const { resolvedMessageId, resolvedEntity, uploadPreserve } =
        prep.prepared;

      if (input.confirmed) {
        const gateError = confirmationGate.validateConfirmed(
          input.confirmationToken,
          input,
        );
        if (gateError) return gateError;
      } else {
        const confirmation = uploadPreserve
          ? buildUploadPreserveConfirmation({
              ...(createInput.title && { title: createInput.title }),
              filename: uploadPreserve.filename,
              mediaType: uploadPreserve.mediaType,
              entityType: createInput.entityType,
              visibility: createInput.visibility,
            })
          : buildCreateConfirmation(createInput);
        const confirmationSource = freezeConfirmationSource({
          source: input.source,
          ...(resolvedMessageId && { resolvedMessageId }),
          ...(resolvedEntity && { resolvedEntity }),
          ...(createInput.content !== undefined
            ? { content: createInput.content }
            : {}),
        });
        const confirmationArgs = confirmationGate.buildArgs(
          (confirmationToken) => ({
            entityType: createInput.entityType,
            ...(createInput.title && { title: createInput.title }),
            ...(createInput.visibility !== undefined
              ? { visibility: createInput.visibility }
              : {}),
            source: confirmationSource,
            ...(createInput.fields && { fields: createInput.fields }),
            ...(createInput.replace && { replace: createInput.replace }),
            confirmed: true,
            confirmationToken,
          }),
        );
        return {
          needsConfirmation: true,
          toolName: "system_create",
          summary: confirmation.summary,
          preview: confirmation.preview,
          args: confirmationArgs,
        };
      }
      return executePreparedCreate(services, prep.prepared, toolContext);
    },
    { visibility: "trusted", sideEffects: "writes" },
  );
}
