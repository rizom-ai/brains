import {
  generateMarkdownWithFrontmatter,
  encodeEntityIdPath,
  entityIdPathSchema,
  canWriteVisibility,
} from "@brains/sdk/entities";
import { SdkError } from "@brains/sdk/services";
import {
  DIRECTORY_SYNC_CHANNELS,
  directorySyncPathRequestSchema,
  directorySyncPathResponseSchema,
} from "@brains/contracts";
import type {
  BaseEntity,
  ContentVisibility,
  EntityInput,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import {
  getTypeCapabilities,
  recordStudioMutationAudit,
  requireEntityAction,
  studioEventContext,
} from "./editor-access";
import {
  rejectBodyForBodylessType,
  resolveStudioVisibility,
  splitEntityContent,
  stripStudioPolicyMetadata,
  withStudioVisibility,
} from "./editor-content";
import type {
  StudioAuditRecorder,
  StudioRequestAccess,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";
import type { StudioRuntime } from "./runtime";
import {
  studioCollectionQuerySchema,
  studioCollectionQueryFromParams,
} from "./collection-query";

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

/** Placement is optional, but malformed responses must not become permission to write. */
async function resolvePlacement(
  runtime: StudioRuntime,
  entityType: string,
  entityId: string,
  entity: Pick<BaseEntity, "metadata" | "content">,
): Promise<z.output<typeof directorySyncPathResponseSchema> | null> {
  const response = await runtime.messaging.request(
    {
      topic: DIRECTORY_SYNC_CHANNELS.pathRequest,
      payload: directorySyncPathRequestSchema,
      response: directorySyncPathResponseSchema,
    },
    {
      entityType,
      entityId,
      metadata: entity.metadata,
      content: entity.content,
    },
  );
  if (!response.ok) {
    if (response.code === "invalid_response")
      throw new SdkError("invalid_response");
    return null;
  }
  return response.data;
}

export async function handlePreviewDestination(
  runtime: StudioRuntime,
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
  if (!runtime.shapes.frontmatterSchema(payload.entityType))
    return jsonResponse({ error: "Unknown entity type" }, 404);
  const denied = requireEntityAction(
    runtime.operator,
    payload.entityType,
    "create",
    access,
  );
  if (denied) return denied;
  const assembled = assembleEntity(
    runtime,
    payload.entityType,
    payload,
    undefined,
  );
  if (assembled instanceof Response) return assembled;
  if (!canWriteVisibility(access.permissionLevel, assembled.entity.visibility))
    return jsonResponse({ error: "Cannot create at this visibility" }, 403);
  const entityId = encodeEntityIdPath(payload.idPath);
  const placement = await resolvePlacement(
    runtime,
    payload.entityType,
    entityId,
    assembled.entity,
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

export async function handleGetEntityHierarchy(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType)
    return jsonResponse({ error: "type query parameter is required" }, 400);
  if (!(await getTypeCapabilities(runtime, entityType, access)))
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  const query = studioCollectionQuerySchema.safeParse(
    studioCollectionQueryFromParams(params),
  );
  if (!query.success)
    return jsonResponse({ error: "Invalid folder query" }, 400);
  const { prefix, scope, q, visibility, status, sort, limit, offset } =
    query.data;
  try {
    const page = await runtime.entities.queryEntityHierarchy({
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
          ...splitEntityContent(entityType, entity.content).frontmatter,
          visibility: entity.visibility,
        },
        displayTitle: runtime.shapes.displayTitle(entity),
        updated: entity.updated,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonResponse({ error: "Invalid folder prefix" }, 400);
    throw error;
  }
}

const deleteEntityPayloadSchema = z.object({
  confirmed: z.literal(true),
});

export async function handleGetEntities(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }
  if (!(await getTypeCapabilities(runtime, entityType, access))) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const id = params.get("id");
  if (id) {
    const entity = await runtime.entities.getEntity({
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
    );
    return jsonResponse({
      entity: {
        id: entity.id,
        entityType: entity.entityType,
        // The editor contract always carries the authoritative system field,
        // even though public and raw entities omit it from stored markdown.
        frontmatter: { ...frontmatter, visibility: entity.visibility },
        displayTitle: runtime.shapes.displayTitle(entity),
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
  if (!query.success)
    return jsonResponse({ error: "Invalid entity page" }, 400);
  const filter = {
    visibilityScope: access.visibilityScope,
    ...(query.data.visibility !== "all"
      ? { visibility: query.data.visibility }
      : {}),
    ...(query.data.q ? { contentContains: query.data.q } : {}),
    ...(query.data.status ? { metadata: { status: query.data.status } } : {}),
  };
  const [entities, total] = await Promise.all([
    runtime.entities.listEntities({
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
    runtime.entities.count({ entityType, options: { filter } }),
  ]);
  return jsonResponse({
    total,
    entities: entities.map((entity) => ({
      displayTitle: runtime.shapes.displayTitle(entity),
      id: entity.id,
      entityType: entity.entityType,
      frontmatter: {
        ...splitEntityContent(entityType, entity.content).frontmatter,
        visibility: entity.visibility,
      },
      updated: entity.updated,
    })),
  });
}

/**
 * The entity a form describes, assembled the way the type's own adapter
 * reads it back. Incoming form data is never the authority: the markdown is
 * written and re-parsed, so what is stored is what the type says it means.
 */
function assembleEntity(
  runtime: StudioRuntime,
  entityType: string,
  payload: {
    frontmatter: Record<string, unknown>;
    body?: string | undefined;
  },
  existing: BaseEntity | undefined,
):
  | { entity: EntityInput<BaseEntity> & { visibility: ContentVisibility } }
  | Response {
  const bodyError = rejectBodyForBodylessType(
    runtime.shapes,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const schema = runtime.shapes.frontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const raw = isRawEntityType(entityType);
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
    existing?.visibility ?? "public",
  );
  if (!visibility.success) return visibility.response;

  // Validate before anything is written — field-level errors go back to the
  // form, and the runtime is never asked to store invalid frontmatter.
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

  const body =
    payload.body ??
    (existing ? splitEntityContent(entityType, existing.content).body : "");
  const content = raw
    ? body
    : generateMarkdownWithFrontmatter(
        body,
        withStudioVisibility(frontmatter.data, visibility.visibility),
      );

  const parsed = runtime.shapes.parse(entityType, content);
  return {
    entity: {
      ...existing,
      ...parsed,
      entityType,
      content,
      metadata: stripStudioPolicyMetadata(
        parsed?.metadata ?? existing?.metadata ?? {},
      ),
      visibility: visibility.visibility,
      ...(existing ? { id: existing.id } : {}),
    },
  };
}

export async function handleUpdateEntity(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: StudioAuditRecorder,
): Promise<Response> {
  let payload: z.infer<typeof updateEntityPayloadSchema>;
  try {
    payload = updateEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid update payload" }, 400);
  }

  const { entityType, id } = payload;
  if (!runtime.shapes.frontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  // Asked before the entity is even read, so a refused caller is told at
  // once; the write asks again at the moment it happens.
  const actionDenied = requireEntityAction(
    runtime.operator,
    entityType,
    "update",
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

  const existing = await runtime.entities.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const assembled = assembleEntity(runtime, entityType, payload, existing);
  if (assembled instanceof Response) return assembled;

  const outcome = await runtime.operator.update(
    {
      entityType,
      id: existing.id,
      next: { ...existing, ...assembled.entity, id: existing.id },
      ...(payload.baseContentHash !== undefined
        ? { baseContentHash: payload.baseContentHash }
        : {}),
      eventContext: studioEventContext(access),
    },
    access.caller,
  );

  switch (outcome.kind) {
    case "not-found":
      return jsonResponse({ error: `Entity not found: ${id}` }, 404);
    case "conflict":
      return jsonResponse(
        {
          error:
            "This entry changed since it was opened — likely updated by " +
            "another writer (an agent, or a git import via directory-sync). " +
            "Reload to review before saving again.",
          currentContentHash: outcome.currentContentHash,
        },
        409,
      );
    case "denied":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "update",
        "denied",
        entityType,
        id,
        outcome.reason,
      );
      return jsonResponse({ error: outcome.message }, 403);
    case "updated":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "update",
        "allowed",
        entityType,
        id,
      );
      // skipped: the content was already stored byte-identically — no event
      // is emitted, so nothing flows down the export/commit pipeline.
      return jsonResponse({
        entityId: outcome.result.entityId,
        jobId: outcome.result.jobId,
        skipped: outcome.result.skipped,
      });
  }
}

export async function handleCreateEntity(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: StudioAuditRecorder,
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
  if (!runtime.shapes.frontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  // Asked before the form is even read, so a refused caller is told at once
  // rather than after assembling something they may not store.
  const actionDenied = requireEntityAction(
    runtime.operator,
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

  const assembled = assembleEntity(runtime, entityType, payload, undefined);
  if (assembled instanceof Response) return assembled;

  if (
    !canWriteVisibility(access.permissionLevel, assembled.entity.visibility)
  ) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "create",
      "denied",
      entityType,
      undefined,
      "visibility-policy",
    );
    return jsonResponse({ error: "Cannot create at this visibility" }, 403);
  }
  if (payload.idPath) {
    const placement = await resolvePlacement(
      runtime,
      entityType,
      encodeEntityIdPath(payload.idPath),
      assembled.entity,
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
  let outcome;
  try {
    outcome = await runtime.operator.create(
      {
        entityType,
        entity: assembled.entity,
        ...(payload.idPath ? { idPath: payload.idPath } : {}),
        eventContext: studioEventContext(access),
      },
      access.caller,
    );
  } catch (error) {
    // Runtime and packed package can have different constructor identities.
    if (error instanceof Error && error.name === "EntityWriteConflictError") {
      return jsonResponse(
        {
          error: "An entry already exists at this destination.",
          issues: [
            { path: ["segment"], message: "Choose a different segment." },
          ],
        },
        409,
      );
    }
    throw error;
  }

  switch (outcome.kind) {
    case "denied":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "create",
        "denied",
        entityType,
        undefined,
        outcome.reason,
      );
      return jsonResponse(
        { error: outcome.message },
        outcome.reason === "unknown-type" ? 404 : 403,
      );
    case "created":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "create",
        "allowed",
        entityType,
        outcome.entityId,
      );
      return jsonResponse(
        { entityId: outcome.entityId, jobId: outcome.jobId },
        201,
      );
  }
}

export async function handleDeleteEntity(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: StudioAuditRecorder,
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

  const outcome = await runtime.operator.delete(
    { entityType, id, eventContext: studioEventContext(access) },
    access.caller,
  );

  switch (outcome.kind) {
    case "not-found":
      return jsonResponse({ error: `Entity not found: ${id}` }, 404);
    case "denied":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "delete",
        "denied",
        entityType,
        id,
        outcome.reason,
      );
      return jsonResponse(
        { error: outcome.message },
        outcome.reason === "unknown-type" ? 404 : 403,
      );
    case "deleted":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "delete",
        "allowed",
        entityType,
        id,
      );
      return jsonResponse({ deleted: true });
  }
}
