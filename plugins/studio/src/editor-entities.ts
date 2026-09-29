import type {
  BaseEntity,
  GetEntityRequest,
  ServicePluginContext,
} from "@brains/plugins";
import { encodeEntityIdPath } from "@brains/entity-service";
import {
  assetRefSchema,
  getAssetDigest,
  MAX_ASSET_BYTES,
} from "@brains/assets";
import {
  DIRECTORY_SYNC_CHANNELS,
  directorySyncPathResponseSchema,
} from "@brains/contracts";
import {
  canWriteVisibility,
  createFileResponse,
  generateMarkdownWithFrontmatter,
  preserveSourceFrontmatter,
  getPublishBoundaryState,
  entityIdPathSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import {
  studioMutationOptions,
  getTypeCapabilities,
  recordStudioMutationAudit,
  requireEntityAction,
} from "./editor-access";
import {
  rejectBodyForBodylessType,
  resolveStudioVisibility,
  splitEntityContent,
  stripStudioPolicyMetadata,
  withStudioVisibility,
} from "./editor-content";
import {
  type StudioRequestAccess,
  type EditorRouteOptions,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";
import { editorValidationResponse } from "./editor-validation";
import { GROUPING_DEFINITIONS_TYPE } from "./grouping-definitions-contract";
import {
  studioCollectionQuerySchema,
  studioCollectionQueryFromParams,
} from "./collection-query";

/** Entity adapters own title derivation; Studio must not reinterpret source. */
export function entityDisplayTitle(
  context: ServicePluginContext,
  entity: BaseEntity,
): string | undefined {
  const title =
    context.entities.getAdapter(entity.entityType)?.extractMetadata(entity)[
      "title"
    ] ?? entity.metadata["title"];
  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

/** Authoring reads preserve source; rendering must never change a save draft. */
function readEditorEntity(
  context: ServicePluginContext,
  request: GetEntityRequest,
): Promise<BaseEntity | null> {
  return context.entityService.getEntityRaw(request);
}

const imagePreviewQuerySchema = z.object({
  id: z.string().min(1),
  format: z.literal("source").optional(),
});
const imagePreviewMetadataSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
});

/** Binary images are readable for previews, not editable frontmatter types. */
export async function handleGetImagePreview(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  request.signal.throwIfAborted();
  const url = new URL(request.url);
  const query = imagePreviewQuerySchema.safeParse({
    id: url.searchParams.get("id"),
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!query.success)
    return jsonResponse({ error: "Image id is required" }, 400);
  const image = context.entityService.getEntityTypes().includes("image")
    ? await context.entityService.getEntityRaw({
        entityType: "image",
        id: query.data.id,
        visibilityScope: access.visibilityScope,
      })
    : null;
  const ref = assetRefSchema.safeParse(image?.content);
  const metadata = imagePreviewMetadataSchema.safeParse(image?.metadata);
  if (
    !ref.success ||
    !metadata.success ||
    image?.metadata["status"] === "pending" ||
    image?.metadata["status"] === "failed"
  )
    return jsonResponse({ error: "Image unavailable" }, 404);
  const record = await context.entityService.statAsset(ref.data);
  if (!record) return jsonResponse({ error: "Image unavailable" }, 404);
  if (record.ref !== ref.data || record.sizeBytes !== metadata.data.sizeBytes)
    throw new Error("Studio image metadata does not match its asset record");
  request.signal.throwIfAborted();
  if (!query.data.format) {
    // A browser URL is not a file loan or authorization grant. The source request
    // below repeats session/visibility admission and never accepts a raw asset ref.
    const params = new URLSearchParams({ id: query.data.id, format: "source" });
    return jsonResponse({ source: `${url.pathname}?${params}` });
  }
  const files = context.entityService.fileAssets;
  if (!files) throw new Error("Studio image file delivery is not provisioned");
  return createFileResponse({
    headers: {
      "Content-Type": metadata.data.mediaType,
      "Cache-Control": "no-store",
    },
    signal: request.signal,
    files,
    onRetirementError: (error): void =>
      context.logger.error("Studio image file retirement failed", { error }),
    withFile: (use, signal): Promise<void> =>
      files.withAssetFile(
        ref.data,
        async (file, ownerSignal): Promise<void> => {
          if (
            file.sha256 !== getAssetDigest(ref.data) ||
            file.sizeBytes !== record.sizeBytes
          )
            throw new Error(
              "Studio image loan does not match its asset record",
            );
          await use(file, ownerSignal);
        },
        { signal },
      ),
  });
}

const updateEntityPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
  /** Content hash the edit was based on; stale writes are rejected. */
  baseContentHash: z.string().optional(),
});

const createEntityPayloadSchema = z.object({
  entityType: z.string(),
  idPath: entityIdPathSchema.optional(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
});

const destinationPayloadSchema = createEntityPayloadSchema.extend({
  idPath: entityIdPathSchema,
});

function invalidCreatePayload(error: unknown, input: unknown): Response {
  const candidate =
    typeof input === "object" && input !== null && "idPath" in input
      ? input.idPath
      : null;
  const leafIndex = Array.isArray(candidate) ? candidate.length - 1 : 0;
  return jsonResponse(
    {
      error: "Invalid destination or entry fields",
      ...(error instanceof z.ZodError && {
        issues: error.issues.map((issue) => ({
          ...issue,
          path:
            issue.path[0] === "idPath"
              ? [
                  issue.path.length < 2 || issue.path[1] === leafIndex
                    ? "segment"
                    : "prefix",
                ]
              : issue.path,
        })),
      }),
    },
    400,
  );
}

/** Directory-sync is optional; only an explicit placement denial blocks creation. */
async function resolvePlacement(
  context: ServicePluginContext,
  entityType: string,
  entityId: string,
  entity: Pick<BaseEntity, "metadata" | "content">,
): Promise<z.output<typeof directorySyncPathResponseSchema> | null> {
  const response = await context.messaging.send({
    type: DIRECTORY_SYNC_CHANNELS.pathRequest,
    payload: {
      entityType,
      entityId,
      metadata: entity.metadata,
      content: entity.content,
    },
  });
  return "success" in response &&
    response.success &&
    response.data !== undefined
    ? directorySyncPathResponseSchema.parse(response.data)
    : null;
}

export async function handlePreviewDestination(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let input: unknown;
  let payload: z.infer<typeof destinationPayloadSchema>;
  try {
    input = await request.json();
    payload = destinationPayloadSchema.parse(input);
  } catch (error) {
    return invalidCreatePayload(error, input);
  }
  if (!context.entities.getEffectiveFrontmatterSchema(payload.entityType))
    return jsonResponse({ error: "Unknown entity type" }, 404);
  const denied = requireEntityAction(
    context,
    payload.entityType,
    "create",
    access,
  );
  if (denied) return denied;
  await context.entities.ensureGroupingsCurrent();
  const entity = prepareStudioCreation(context, payload);
  if (entity instanceof Response) return entity;
  if (!canWriteVisibility(access.permissionLevel, entity.visibility))
    return jsonResponse({ error: "Cannot create at this visibility" }, 403);
  const entityId = encodeEntityIdPath(payload.idPath);
  const placement = await resolvePlacement(
    context,
    payload.entityType,
    entityId,
    entity,
  );
  const [first, ...rest] = payload.idPath;
  const encodedLeaf = encodeEntityIdPath([rest.at(-1) ?? first]);
  return jsonResponse({
    idPath: payload.idPath,
    entityId,
    entityLeaf: {
      start: entityId.length - encodedLeaf.length,
      end: entityId.length,
    },
    filePath: placement?.relativePath ?? null,
    fileLeaf: placement?.leaf ?? null,
    fileWritable: placement?.writable ?? null,
    fileOwner: placement?.owner ?? null,
  });
}

const deleteEntityPayloadSchema = z.object({
  confirmed: z.literal(true),
});

export async function handleGetEntities(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }
  if (!(await getTypeCapabilities(context, entityType, access))) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const id = params.get("id");
  if (id) {
    const entity = await readEditorEntity(context, {
      entityType,
      id,
      visibilityScope: access.visibilityScope,
    });
    if (!entity) {
      return jsonResponse({ error: `Entity not found: ${id}` }, 404);
    }
    const { frontmatter, body } = splitEntityContent(
      entityType,
      entity.content,
      context,
    );
    return jsonResponse({
      entity: {
        id: entity.id,
        entityType: entity.entityType,
        // The editor contract always carries the authoritative system field,
        // even though public and raw entities omit it from stored markdown.
        frontmatter: { ...frontmatter, visibility: entity.visibility },
        displayTitle: entityDisplayTitle(context, entity),
        body,
        contentHash: entity.contentHash,
        created: entity.created,
        updated: entity.updated,
      },
    });
  }

  const query = studioCollectionQuerySchema.safeParse(
    studioCollectionQueryFromParams(params),
  );
  if (!query.success) {
    return jsonResponse({ error: "Invalid entity page" }, 400);
  }

  const filter = {
    visibilityScope: access.visibilityScope,
    ...(query.data.visibility !== "all"
      ? { visibility: query.data.visibility }
      : {}),
    ...(query.data.q ? { contentContains: query.data.q } : {}),
    ...(query.data.status ? { metadata: { status: query.data.status } } : {}),
  };
  const [entities, total] = await Promise.all([
    context.entityService.listEntities({
      entityType,
      options: {
        offset: query.data.offset,
        limit: query.data.limit,
        sortFields: [
          {
            field: query.data.sort.startsWith("created")
              ? "created"
              : "updated",
            direction: query.data.sort.endsWith("asc") ? "asc" : "desc",
          },
          { field: "id", direction: "asc" },
        ],
        filter,
      },
    }),
    context.entityService.countEntities({ entityType, options: { filter } }),
  ]);
  return jsonResponse({
    total,
    entities: entities.map((entity) => {
      const { frontmatter } = splitEntityContent(
        entityType,
        entity.content,
        context,
      );
      return {
        id: entity.id,
        entityType: entity.entityType,
        frontmatter: { ...frontmatter, visibility: entity.visibility },
        displayTitle: entityDisplayTitle(context, entity),
        updated: entity.updated,
      };
    }),
  });
}

export async function handleGetEntityHierarchy(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType)
    return jsonResponse({ error: "type query parameter is required" }, 400);
  if (!(await getTypeCapabilities(context, entityType, access)))
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  const query = studioCollectionQuerySchema.safeParse(
    studioCollectionQueryFromParams(params),
  );
  if (!query.success)
    return jsonResponse({ error: "Invalid folder query" }, 400);
  const { prefix, scope, q, visibility, status, sort, limit, offset } =
    query.data;
  try {
    const page = await context.entityService.queryEntityHierarchy({
      entityType,
      prefix: scope === "collection" ? null : prefix,
      limit,
      offset,
      visibilityScope: access.visibilityScope,
      includeDescendants: scope === "collection" || Boolean(q),
      filter: {
        ...(q && { contentContains: q }),
        ...(visibility !== "all" && { visibility }),
        ...(status && { metadata: { status } }),
      },
      sortFields: [
        {
          field: sort.startsWith("created") ? "created" : "updated",
          direction: sort.endsWith("asc") ? "asc" : "desc",
        },
        { field: "id", direction: "asc" },
      ],
      signal: request.signal,
    });
    return jsonResponse({
      prefix: page.prefix,
      folders: page.folders,
      total: page.totalEntities,
      entities: page.entities.map(({ entity, path }) => ({
        id: entity.id,
        entityType: entity.entityType,
        path,
        frontmatter: {
          ...splitEntityContent(entityType, entity.content, context)
            .frontmatter,
          visibility: entity.visibility,
        },
        displayTitle: entityDisplayTitle(context, entity),
        updated: entity.updated,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonResponse({ error: "Invalid folder prefix" }, 400);
    throw error;
  }
}

export async function handleUpdateEntity(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  let payload: z.infer<typeof updateEntityPayloadSchema>;
  try {
    payload = updateEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid update payload" }, 400);
  }

  const { entityType, id } = payload;
  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const existing = await readEditorEntity(context, {
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType, context.entities);
  const domainFrontmatter = stripStudioPolicyMetadata(payload.frontmatter);
  if (raw && Object.keys(domainFrontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const visibility = resolveStudioVisibility(
    payload.frontmatter,
    existing.visibility,
  );
  if (!visibility.success) return visibility.response;

  // Validate before anything is written — field-level errors go back to
  // the form, the entity service is never called with invalid frontmatter.
  const frontmatter = raw
    ? z.object({}).safeParse({})
    : // `visibility` is a system field in the editor projection. It is
      // resolved above and must not reach a strict domain schema.
      schema.safeParse(domainFrontmatter);
  if (!frontmatter.success) {
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  }

  const source = splitEntityContent(entityType, existing.content, context);
  const body = payload.body ?? source.body;
  const claimedFields = Object.fromEntries(
    Object.entries(frontmatter.data).filter(([key]) =>
      Object.hasOwn(schema.shape, key),
    ),
  );
  const serialized = raw
    ? body
    : generateMarkdownWithFrontmatter(
        body,
        withStudioVisibility(claimedFields, visibility.visibility),
      );
  // An unparseable definition document cannot supply unclaimed fields. Its
  // full source was shown for explicit repair; the replacement passed strict
  // validation above and still goes through permissions and stale-write checks.
  const content =
    raw || source.malformed
      ? serialized
      : preserveSourceFrontmatter(existing.content, serialized, schema, []);

  // Re-derive adapter fields (metadata, visibility, etc.) from the finalized
  // content before applying policy. Incoming form data is never the authority.
  const parsed = deserializeStudioEntity(context, entityType, content);
  if (parsed instanceof Response) return parsed;
  const entity: BaseEntity = {
    ...existing,
    ...parsed,
    id: existing.id,
    entityType: existing.entityType,
    content,
    metadata: stripStudioPolicyMetadata(parsed.metadata ?? existing.metadata),
    visibility: visibility.visibility,
  };

  const publishBoundary = getPublishBoundaryState(
    entityType,
    existing.metadata["status"],
    entity.metadata["status"],
    context.entityService,
  );
  const requiredAction =
    publishBoundary === "non-publish" ? "update" : "publish";
  const actionDenied = requireEntityAction(
    context,
    entityType,
    requiredAction,
    access,
  );
  if (actionDenied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return actionDenied;
  }

  if (!canWriteVisibility(access.permissionLevel, entity.visibility)) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "visibility-policy",
    );
    return jsonResponse(
      {
        error: `Cannot set entity visibility to "${entity.visibility}" at ${access.permissionLevel} permission.`,
      },
      403,
    );
  }

  // Stale-write guard: another writer (an agent, or a git import through
  // directory-sync) may have touched this entity since it was opened.
  if (
    payload.baseContentHash !== undefined &&
    payload.baseContentHash !== existing.contentHash
  ) {
    return jsonResponse(
      {
        error:
          "This entry changed since it was opened — likely updated by " +
          "another writer (an agent, or a git import via directory-sync). " +
          "Reload to review before saving again.",
        currentContentHash: existing.contentHash,
      },
      409,
    );
  }

  const persistenceDenied = requireEntityAction(
    context,
    entityType,
    requiredAction,
    access,
  );
  if (persistenceDenied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return persistenceDenied;
  }

  let result;
  try {
    result = await context.entityService.updateEntity({
      entity,
      options: studioMutationOptions(access),
    });
  } catch (error) {
    const invalid = editorValidationResponse(error);
    if (invalid) return invalid;
    throw error;
  }
  await recordStudioMutationAudit(
    recordAuditEvent,
    access,
    "update",
    "allowed",
    entityType,
    id,
  );
  // skipped: the content was already stored byte-identically — no event is
  // emitted, so nothing flows down the export/commit pipeline.
  return jsonResponse({
    entityId: result.entityId,
    jobId: result.jobId,
    skipped: result.skipped,
  });
}

function deserializeStudioEntity(
  context: ServicePluginContext,
  entityType: string,
  content: string,
): Partial<BaseEntity> | Response {
  try {
    return context.entityService.deserializeEntity(content, entityType);
  } catch (error) {
    const invalid = editorValidationResponse(error);
    if (invalid) return invalid;
    throw error;
  }
}

function prepareStudioCreation(
  context: ServicePluginContext,
  payload: z.infer<typeof createEntityPayloadSchema>,
):
  | (Partial<BaseEntity> &
      Pick<BaseEntity, "entityType" | "content" | "metadata" | "visibility">)
  | Response {
  const { entityType } = payload;
  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema)
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;
  const raw = isRawEntityType(entityType, context.entities);
  const domainFrontmatter = stripStudioPolicyMetadata(payload.frontmatter);
  if (raw && Object.keys(domainFrontmatter).length > 0)
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  const visibility = resolveStudioVisibility(
    payload.frontmatter,
    entityType === GROUPING_DEFINITIONS_TYPE ? "shared" : "public",
  );
  if (!visibility.success) return visibility.response;
  // System visibility is validated separately, never by a strict domain schema.
  const frontmatter = raw
    ? z.object({}).safeParse({})
    : schema.safeParse(domainFrontmatter);
  if (!frontmatter.success)
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  const content = raw
    ? (payload.body ?? "")
    : generateMarkdownWithFrontmatter(
        payload.body ?? "",
        withStudioVisibility(
          Object.fromEntries(
            Object.entries(frontmatter.data).filter(([key]) =>
              Object.hasOwn(schema.shape, key),
            ),
          ),
          visibility.visibility,
        ),
      );
  const parsed = deserializeStudioEntity(context, entityType, content);
  if (parsed instanceof Response) return parsed;
  return {
    ...parsed,
    ...(payload.idPath && { id: encodeEntityIdPath(payload.idPath) }),
    entityType,
    content,
    metadata: stripStudioPolicyMetadata(parsed.metadata ?? {}),
    visibility: visibility.visibility,
  };
}

export async function handleCreateEntity(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  let payload: z.infer<typeof createEntityPayloadSchema>;
  let input: unknown;
  try {
    input = await request.json();
    payload = createEntityPayloadSchema.parse(input);
  } catch (error) {
    return invalidCreatePayload(error, input);
  }

  const { entityType } = payload;
  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const actionDenied = requireEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  if (actionDenied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "entity-action-policy",
    );
    return actionDenied;
  }

  await context.entities.ensureGroupingsCurrent();
  const entity = prepareStudioCreation(context, payload);
  if (entity instanceof Response) return entity;
  if (!canWriteVisibility(access.permissionLevel, entity.visibility)) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "visibility-policy",
    );
    return jsonResponse(
      {
        error: `Cannot set entity visibility to "${entity.visibility}" at ${access.permissionLevel} permission.`,
      },
      403,
    );
  }

  // Recheck at the persistence boundary after adapter-derived policy fields.
  const persistenceDenied = requireEntityAction(
    context,
    entityType,
    "create",
    access,
  );
  if (persistenceDenied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "entity-action-policy",
    );
    return persistenceDenied;
  }

  if (payload.idPath) {
    const placement = await resolvePlacement(
      context,
      entityType,
      encodeEntityIdPath(payload.idPath),
      entity,
    );
    if (placement?.writable === false) {
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "create",
        "denied",
        entityType,
        undefined,
        "invalid-placement",
      );
      const nested = payload.idPath.length > 1;
      const reason = placement.owner
        ? `reads as ${placement.owner.entityType}/${placement.owner.id}`
        : "was refused by directory-sync";
      return jsonResponse(
        {
          error: `This destination cannot be exported: ${placement.relativePath} ${reason}.`,
          issues: [
            {
              path: [nested ? "prefix" : "segment"],
              message: nested
                ? "Choose a different folder for this entry."
                : "Choose a different segment.",
            },
          ],
        },
        400,
      );
    }
  }

  // Explicit paths are create-if-absent; other creation flows retain server-derived IDs.
  let result;
  try {
    result = await context.entityService.createEntity({
      entity,
      options: {
        ...studioMutationOptions(access),
        ...(payload.idPath && { conditionalWrite: { expectedRevision: null } }),
      },
    });
  } catch (error) {
    const invalid = editorValidationResponse(error);
    if (invalid) return invalid;
    // The packed plugin and source runtime can carry separate class copies.
    // Match the entity-service error's stable name, not constructor identity.
    if (error instanceof Error && error.name === "EntityWriteConflictError")
      return jsonResponse(
        {
          error: "An entry already exists at this destination.",
          issues: [
            { path: ["segment"], message: "Choose a different segment." },
          ],
        },
        409,
      );
    throw error;
  }
  await recordStudioMutationAudit(
    recordAuditEvent,
    access,
    "create",
    "allowed",
    entityType,
    result.entityId,
  );

  return jsonResponse({ entityId: result.entityId, jobId: result.jobId }, 201);
}

export async function handleDeleteEntity(
  context: ServicePluginContext,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  try {
    deleteEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Explicit delete confirmation required" },
      400,
    );
  }

  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }

  const existing = await readEditorEntity(context, {
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const actionDenied = requireEntityAction(
    context,
    entityType,
    "delete",
    access,
  );
  if (actionDenied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "delete",
      "denied",
      entityType,
      id,
      "entity-action-policy",
    );
    return actionDenied;
  }

  const deleted = await context.entityService.deleteEntity({
    entityType,
    id,
    options: studioMutationOptions(access),
  });
  if (deleted) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "delete",
      "allowed",
      entityType,
      id,
    );
  }
  return jsonResponse({ deleted });
}
