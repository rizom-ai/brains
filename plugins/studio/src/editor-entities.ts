import { recordConflictContract } from "@brains/contracts";
import {
  encodeEntityIdPath,
  canWriteVisibility,
  generateMarkdownWithFrontmatter,
  preserveSourceFrontmatter,
  requiredUpdateActions,
  entityIdPathSchema,
  type BaseEntity,
  type EntityIdPath,
  type GetEntityRequest,
} from "@brains/sdk/internal/entity-runtime";
import { createArtifactResponse } from "@brains/sdk/internal/interface-runtime";
import {
  directorySyncPathContract,
  type directorySyncPathResponseSchema,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import { STUDIO_THUMBNAIL_WIDTH } from "./studio-thumbnail";
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
import {
  containedTypeOf,
  containerPage,
  type HierarchyQueryBase,
} from "./container-hierarchy";
import {
  editorValidationResponse,
  frontmatterIssueResponse,
} from "./editor-validation";
import { titleFolders } from "./folder-titles";
import { GROUPING_DEFINITIONS_TYPE } from "./grouping-definitions-contract";
import {
  studioCollectionQuerySchema,
  studioCollectionQueryFromParams,
} from "./collection-query";
import type { StudioContext } from "./studio-context";

/** Entity adapters own title derivation; Studio must not reinterpret source. */
/** How Studio names an entry; the same rule the ⌘K palette uses. */
export function entityDisplayTitle(
  context: StudioContext,
  entity: BaseEntity,
): string | undefined {
  // Studio reads a declared type as stored, while its title is derived from
  // the record as the type reads it: the body, not the document.
  const declared = context.shapes.metadataFromFrontmatter(entity.entityType);
  return context.shapes.displayTitle(
    declared
      ? {
          ...entity,
          content: splitEntityContent(
            entity.entityType,
            entity.content,
            context,
          ).body,
        }
      : entity,
  );
}

/**
 * Authoring reads preserve source; rendering must never change a save draft.
 * The source is the stored document, frontmatter included, which a declared
 * type's ordinary reads leave out.
 */
function readEditorEntity(
  context: StudioContext,
  request: GetEntityRequest,
): Promise<BaseEntity | null> {
  return context.entityService.getEntityRaw({ ...request, source: true });
}

const imagePreviewQuerySchema = z.object({
  id: z.string().min(1),
  width: z.literal(String(STUDIO_THUMBNAIL_WIDTH)).optional(),
});

/**
 * A thumbnail-sized WebP of a raster image. A format the resizer cannot read,
 * such as SVG, keeps its original response.
 */
async function thumbnailResponse(response: Response): Promise<Response> {
  if (
    !/^image\/(png|jpeg|webp|gif|avif)$/i.test(
      response.headers.get("Content-Type") ?? "",
    )
  )
    return response;
  const source = new Uint8Array(await response.arrayBuffer());
  try {
    const bytes = await new Bun.Image(source)
      .resize(STUDIO_THUMBNAIL_WIDTH, undefined, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .bytes();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // An image the resizer cannot decode is still shown, at full size.
    return new Response(source, { headers: response.headers });
  }
}

/**
 * Binary images are readable for previews, not editable frontmatter types.
 * The bytes stream from storage for the image read at the caller's scope;
 * the client never sees an asset reference.
 */
export async function handleGetImagePreview(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const query = imagePreviewQuerySchema.safeParse({
    id: params.get("id"),
    width: params.get("width") ?? undefined,
  });
  if (!query.success)
    return jsonResponse(
      {
        error: params.get("id")
          ? `Images are served whole or ${STUDIO_THUMBNAIL_WIDTH}px wide`
          : "Image id is required",
      },
      400,
    );
  const image = context.entityService.getEntityTypes().includes("image")
    ? await context.entityService.getEntityRaw({
        entityType: "image",
        id: query.data.id,
        visibilityScope: access.visibilityScope,
      })
    : null;
  const response =
    image &&
    (await createArtifactResponse(context.entityService, {
      entityType: "image",
      id: image.id,
      entity: image,
      disposition: "inline",
    }));
  if (!response) return jsonResponse({ error: "Image unavailable" }, 404);
  const served = query.data.width
    ? await thumbnailResponse(response)
    : response;
  // Studio API responses are never cached, previews included.
  served.headers.set("Cache-Control", "no-store");
  return served;
}

const updateEntityPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
  /**
   * Content hash of the version the edit started from. Required: a save
   * over a newer version is kept as a conflict, never written blind.
   */
  baseContentHash: z.string().min(1),
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
  context: StudioContext,
  entityType: string,
  entityId: string,
  entity: Pick<BaseEntity, "metadata" | "content">,
): Promise<z.output<typeof directorySyncPathResponseSchema> | null> {
  const placement = await context.messaging.request(directorySyncPathContract, {
    entityType,
    entityId,
    metadata: entity.metadata,
    content: entity.content,
  });
  return placement.status === "answered" ? placement.data : null;
}

export async function handlePreviewDestination(
  context: StudioContext,
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

/** Each listed collection's member count, for a type that collects entries. */
type MemberCounts = (
  entityType: string,
  entities: BaseEntity[],
) => Promise<ReadonlyMap<string, { count: number; label: string }> | null>;

export async function handleGetEntities(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
  memberCounts?: MemberCounts,
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
        source: true,
        offset: query.data.offset,
        limit: query.data.limit,
        sortFields: [
          {
            field: query.data.sort.startsWith("created")
              ? "created"
              : "updated",
            direction: query.data.sort.endsWith("asc") ? "asc" : "desc",
          },
        ],
        filter,
      },
    }),
    context.entityService.countEntities({ entityType, options: { filter } }),
  ]);
  const counts = (await memberCounts?.(entityType, entities)) ?? null;
  return jsonResponse({
    total,
    entities: entities.map((entity) => {
      const members = counts?.get(entity.id);
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
        ...(members && { members }),
      };
    }),
  });
}

export async function handleGetEntityHierarchy(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
  memberCounts?: MemberCounts,
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
  const base: HierarchyQueryBase = {
    visibilityScope: access.visibilityScope,
    source: true,
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
    ],
    signal: request.signal,
  };
  const searching = scope === "collection" || Boolean(q);
  // An entry's own type decides how it reads: a container's collection holds
  // its contents too.
  const summaryOf =
    (counts: ReadonlyMap<string, { count: number; label: string }> | null) =>
    ({
      entity,
      path,
    }: {
      entity: BaseEntity;
      path: EntityIdPath;
    }): Record<string, unknown> => {
      const members =
        entity.entityType === entityType ? counts?.get(entity.id) : undefined;
      return {
        id: entity.id,
        entityType: entity.entityType,
        path,
        frontmatter: {
          ...splitEntityContent(entity.entityType, entity.content, context)
            .frontmatter,
          visibility: entity.visibility,
        },
        displayTitle: entityDisplayTitle(context, entity),
        updated: entity.updated,
        ...(members && { members }),
      };
    };
  // A collection's rows say how many entries each holds.
  const countsOf = async (
    entities: Array<{ entity: BaseEntity }>,
  ): Promise<ReadonlyMap<string, { count: number; label: string }> | null> =>
    (await memberCounts?.(
      entityType,
      entities
        .map(({ entity }) => entity)
        .filter((entity) => entity.entityType === entityType),
    )) ?? null;
  try {
    const contained = await containedTypeOf(context, entityType, access);
    if (contained !== undefined) {
      const page = await containerPage(context, {
        container: entityType,
        contained,
        prefix: scope === "collection" ? null : prefix,
        searching,
        limit,
        offset,
        base,
        titleOf: (entity) => entityDisplayTitle(context, entity),
      });
      const titled = await titleFolders(context, {
        entityType: contained,
        prefix: page.prefix,
        folders: page.folders,
        visibilityScope: access.visibilityScope,
        signal: request.signal,
      });
      // The container names its own folder; its contents name the rest.
      const trail = titled.trail.map(
        (title, index) => page.trail?.[index] ?? title,
      );
      return jsonResponse({
        prefix: page.prefix,
        folders: titled.folders,
        total: page.total,
        entities: page.entities.map(summaryOf(await countsOf(page.entities))),
        ...(trail.some((title) => title !== null) && { trail }),
      });
    }
    const page = await context.entityService.queryEntityHierarchy({
      ...base,
      entityType,
      prefix: scope === "collection" ? null : prefix,
      limit,
      offset,
      includeDescendants: searching,
    });
    const titled = await titleFolders(context, {
      entityType,
      prefix: page.prefix,
      folders: page.folders,
      visibilityScope: access.visibilityScope,
      signal: request.signal,
    });
    return jsonResponse({
      prefix: page.prefix,
      folders: titled.folders,
      total: page.totalEntities,
      entities: page.entities.map(summaryOf(await countsOf(page.entities))),
      ...(titled.trail.some((title) => title !== null) && {
        trail: titled.trail,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonResponse({ error: "Invalid folder prefix" }, 400);
    throw error;
  }
}

export async function handleUpdateEntity(
  context: StudioContext,
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
  if (!frontmatter.success)
    return frontmatterIssueResponse(frontmatter.error, domainFrontmatter);

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

  // Every action the save needs: publishing is not permission to edit.
  const deniedAction = (): Response | null =>
    requiredUpdateActions(entityType, existing, entity, context.entityService)
      .map((action) => requireEntityAction(context, entityType, action, access))
      .find((denied) => denied !== null) ?? null;
  const actionDenied = deniedAction();
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

  // Another writer (an agent, a drive, a file import) may have changed this
  // entity since it was opened. The edit is then kept as a conflict before
  // the save is refused: until now it lived only in the browser tab.
  if (payload.baseContentHash !== existing.contentHash) {
    // An edit that changes nothing is a save, whatever version it started
    // from: a second click on Save, or a retry of one that went through.
    if (
      content === existing.content &&
      entity.visibility === existing.visibility
    ) {
      return jsonResponse({ entityId: id, jobId: "", skipped: true });
    }
    return staleStudioSave(context, access, {
      existing,
      base: payload.baseContentHash,
      text: content,
      declared: entity.visibility,
    });
  }

  const persistenceDenied = deniedAction();
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
      options: {
        ...studioMutationOptions(access),
        // The check above and this write are one: a change made between
        // them is not overwritten.
        expectedContentHash: payload.baseContentHash,
      },
    });
  } catch (error) {
    const invalid = editorValidationResponse(error);
    if (invalid) return invalid;
    throw error;
  }
  if (result.skipReason === "content-conflict") {
    return staleStudioSave(context, access, {
      existing,
      base: payload.baseContentHash,
      text: content,
      declared: entity.visibility,
    });
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

/**
 * Refuse a save over a newer version, with its text kept as a conflict
 * first. The 409 names the conflict when one holds the edit; when nothing
 * can hold it, the editor still has it.
 */
async function staleStudioSave(
  context: StudioContext,
  access: StudioRequestAccess,
  lost: {
    existing: BaseEntity;
    base: string;
    text: string;
    declared: BaseEntity["visibility"];
  },
): Promise<Response> {
  const { existing, base, text, declared } = lost;
  // The version to replace is read again: the one this request loaded may
  // already be behind the one that overtook it.
  const current =
    (await readEditorEntity(context, {
      entityType: existing.entityType,
      id: existing.id,
      visibilityScope: access.visibilityScope,
    })) ?? existing;
  const kept = await context.messaging.request(recordConflictContract, {
    entityType: current.entityType,
    entityId: current.id,
    origin: "studio",
    actor: access.principal.userId,
    base,
    current: current.contentHash,
    text,
    targetVisibility: current.visibility,
    ...(declared !== current.visibility && { declaredVisibility: declared }),
  });
  return jsonResponse(
    {
      error:
        kept.status === "answered"
          ? "This entry changed since it was opened. Your version is kept as a conflict in the Inbox; reload to review the current one."
          : "This entry changed since it was opened. Reload to review before saving again.",
      currentContentHash: current.contentHash,
      ...(kept.status === "answered" && { conflictId: kept.data.conflictId }),
    },
    409,
  );
}

function deserializeStudioEntity(
  context: StudioContext,
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
  context: StudioContext,
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
    return frontmatterIssueResponse(frontmatter.error, domainFrontmatter);
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
  context: StudioContext,
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
  context: StudioContext,
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
