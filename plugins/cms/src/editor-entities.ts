import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import {
  canWriteVisibility,
  generateMarkdownWithFrontmatter,
  getPublishBoundaryState,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import {
  cmsMutationOptions,
  getTypeCapabilities,
  recordCmsMutationAudit,
  requireEntityAction,
} from "./editor-access";
import {
  rejectBodyForBodylessType,
  resolveCmsVisibility,
  splitEntityContent,
  stripCmsPolicyMetadata,
  withCmsVisibility,
} from "./editor-content";
import type { CmsRequestAccess, EditorRouteOptions } from "./editor-contracts";
import { jsonResponse } from "./editor-response";

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
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().optional(),
});

const deleteEntityPayloadSchema = z.object({
  confirmed: z.literal(true),
});

export async function handleGetEntities(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
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
    const entity = await context.entityService.getEntity({
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
        body,
        contentHash: entity.contentHash,
        created: entity.created,
        updated: entity.updated,
      },
    });
  }

  const entities = await context.entityService.listEntities({
    entityType,
    options: { filter: { visibilityScope: access.visibilityScope } },
  });
  return jsonResponse({
    entities: entities.map((entity) => ({
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

export async function handleUpdateEntity(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
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

  const existing = await context.entityService.getEntity({
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

  const raw = isRawEntityType(entityType);
  const domainFrontmatter = stripCmsPolicyMetadata(payload.frontmatter);
  if (raw && Object.keys(domainFrontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const visibility = resolveCmsVisibility(
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

  const body =
    payload.body ?? splitEntityContent(entityType, existing.content).body;
  const content = raw
    ? body
    : generateMarkdownWithFrontmatter(
        body,
        withCmsVisibility(frontmatter.data, visibility.visibility),
      );

  // Re-derive adapter fields (metadata, visibility, etc.) from the finalized
  // content before applying policy. Incoming form data is never the authority.
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);
  const entity: BaseEntity = {
    ...existing,
    ...parsed,
    id: existing.id,
    entityType: existing.entityType,
    content,
    metadata: stripCmsPolicyMetadata(parsed?.metadata ?? existing.metadata),
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
    await recordCmsMutationAudit(
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
    await recordCmsMutationAudit(
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
    await recordCmsMutationAudit(
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

  const result = await context.entityService.updateEntity({
    entity,
    options: cmsMutationOptions(access),
  });
  await recordCmsMutationAudit(
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

export async function handleCreateEntity(
  context: ServicePluginContext,
  request: Request,
  access: CmsRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  let payload: z.infer<typeof createEntityPayloadSchema>;
  try {
    payload = createEntityPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "Invalid create payload" }, 400);
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
    await recordCmsMutationAudit(
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

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType);
  const domainFrontmatter = stripCmsPolicyMetadata(payload.frontmatter);
  if (raw && Object.keys(domainFrontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const visibility = resolveCmsVisibility(payload.frontmatter, "public");
  if (!visibility.success) return visibility.response;

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

  const content = raw
    ? (payload.body ?? "")
    : generateMarkdownWithFrontmatter(
        payload.body ?? "",
        withCmsVisibility(frontmatter.data, visibility.visibility),
      );
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);
  const entity = {
    ...parsed,
    entityType,
    content,
    metadata: stripCmsPolicyMetadata(parsed?.metadata ?? {}),
    visibility: visibility.visibility,
  };
  if (!canWriteVisibility(access.permissionLevel, entity.visibility)) {
    await recordCmsMutationAudit(
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
    await recordCmsMutationAudit(
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

  // No id: the entity service derives one, keeping id policy server-side.
  const result = await context.entityService.createEntity({
    entity,
    options: cmsMutationOptions(access),
  });
  await recordCmsMutationAudit(
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
  access: CmsRequestAccess,
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

  const existing = await context.entityService.getEntity({
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
    await recordCmsMutationAudit(
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
    options: cmsMutationOptions(access),
  });
  if (deleted) {
    await recordCmsMutationAudit(
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
