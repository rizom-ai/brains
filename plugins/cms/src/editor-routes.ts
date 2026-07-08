import { join } from "node:path";
import type {
  BaseEntity,
  ServicePluginContext,
  WebRouteDefinition,
} from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  entityTypeLabels,
  isRawEntityType,
  zodFieldToCmsWidget,
  type CmsEntityDisplayMap,
} from "./config";
import { renderEditorShellHtml } from "./editor-shell";

const uiAssetFile = join(import.meta.dir, "..", "dist", "ui", "app.js");

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

const UPLOAD_FORM_FIELD = "file";
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface EditorRouteOptions {
  /** Base route the editor is served from, e.g. "/cms". */
  routePath: string;
  getContext: () => ServicePluginContext;
  resolveOperatorSession: (request: Request) => Promise<boolean>;
  getEntityDisplay: () => CmsEntityDisplayMap | undefined;
}

/**
 * Routes for the first-party CMS editor: the React shell, its bundled
 * asset, and the entity read/write API. Every route except the asset is
 * gated on an operator session; writes go through the entity service so
 * the entity DB stays the single authoritative writer.
 */
export function createEditorRoutes(
  options: EditorRouteOptions,
): WebRouteDefinition[] {
  const { routePath, getContext, resolveOperatorSession, getEntityDisplay } =
    options;
  const assetPath = `${routePath}/assets/app.js`;
  const apiPath = (suffix: string): string => `${routePath}/api/${suffix}`;

  const requireSession = async (request: Request): Promise<Response | null> =>
    (await resolveOperatorSession(request))
      ? null
      : jsonResponse({ error: "Operator session required" }, 401);

  return [
    {
      path: routePath,
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        if (!(await resolveOperatorSession(request))) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/login?return_to=${encodeURIComponent(routePath)}`,
              "Cache-Control": "no-store",
            },
          });
        }
        return new Response(renderEditorShellHtml({ assetPath }), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
    {
      path: assetPath,
      method: "GET",
      public: true,
      handler: async (): Promise<Response> => {
        const file = Bun.file(uiAssetFile);
        if (!(await file.exists())) {
          return new Response("CMS editor UI asset not built", {
            status: 404,
          });
        }
        return new Response(file, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
    {
      path: apiPath("types"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleListTypes(getContext(), getEntityDisplay());
      },
    },
    {
      path: apiPath("schema"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleGetSchema(getContext(), request);
      },
    },
    {
      path: apiPath("entities"),
      method: "GET",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleGetEntities(getContext(), request);
      },
    },
    {
      path: apiPath("entities"),
      method: "PUT",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleUpdateEntity(getContext(), request);
      },
    },
    {
      path: apiPath("entities"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleCreateEntity(getContext(), request);
      },
    },
    {
      path: apiPath("entities"),
      method: "DELETE",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleDeleteEntity(getContext(), request);
      },
    },
    {
      path: apiPath("upload"),
      method: "POST",
      public: true,
      handler: async (request): Promise<Response> => {
        const denied = await requireSession(request);
        if (denied) return denied;
        return handleUpload(getContext(), request, apiPath("upload"));
      },
    },
  ];
}

async function handleListTypes(
  context: ServicePluginContext,
  entityDisplay: CmsEntityDisplayMap | undefined,
): Promise<Response> {
  const counts = new Map(
    (await context.entityService.getEntityCounts()).map((entry) => [
      entry.entityType,
      entry.count,
    ]),
  );
  const types = context.entityService.getEntityTypes().flatMap((entityType) => {
    const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
    if (!schema) return [];
    const adapter = context.entities.getAdapter(entityType);
    return [
      {
        entityType,
        label: entityTypeLabels(entityType, entityDisplay?.[entityType])
          .pluralLabel,
        isSingleton: adapter?.isSingleton === true,
        hasBody: adapter?.hasBody !== false,
        count: counts.get(entityType) ?? 0,
      },
    ];
  });

  return jsonResponse({ types });
}

function handleGetSchema(
  context: ServicePluginContext,
  request: Request,
): Response {
  const entityType = new URL(request.url).searchParams.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }

  const schema = context.entities.getEffectiveFrontmatterSchema(entityType);
  if (!schema) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const adapter = context.entities.getAdapter(entityType);
  const raw = isRawEntityType(entityType);
  // Raw types edit the whole document as body; their frontmatter schema is
  // system bookkeeping and must not surface as form fields.
  const fields = raw
    ? []
    : Object.entries(schema.shape).map(([name, fieldSchema]) =>
        zodFieldToCmsWidget(name, fieldSchema as z.ZodTypeAny),
      );

  return jsonResponse({
    entityType,
    format: raw ? "raw" : "frontmatter",
    isSingleton: adapter?.isSingleton === true,
    hasBody: raw || adapter?.hasBody !== false,
    fields,
  });
}

async function handleGetEntities(
  context: ServicePluginContext,
  request: Request,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  if (!entityType) {
    return jsonResponse({ error: "type query parameter is required" }, 400);
  }
  if (!context.entities.getEffectiveFrontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }

  const id = params.get("id");
  if (id) {
    const entity = await context.entityService.getEntity({ entityType, id });
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
        frontmatter,
        body,
        contentHash: entity.contentHash,
        created: entity.created,
        updated: entity.updated,
      },
    });
  }

  const entities = await context.entityService.listEntities({ entityType });
  return jsonResponse({
    entities: entities.map((entity) => ({
      id: entity.id,
      entityType: entity.entityType,
      frontmatter: splitEntityContent(entityType, entity.content).frontmatter,
      updated: entity.updated,
    })),
  });
}

async function handleUpdateEntity(
  context: ServicePluginContext,
  request: Request,
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

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType);
  if (raw && Object.keys(payload.frontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  // Validate before anything is written — field-level errors go back to
  // the form, the entity service is never called with invalid frontmatter.
  const frontmatter = raw
    ? { success: true as const, data: {} }
    : schema.safeParse(payload.frontmatter);
  if (!frontmatter.success) {
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  }

  const existing = await context.entityService.getEntity({ entityType, id });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
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

  const body =
    payload.body ?? splitEntityContent(entityType, existing.content).body;
  const content = raw
    ? body
    : generateMarkdownWithFrontmatter(body, frontmatter.data);

  // Re-derive adapter fields (metadata etc.) from the new content so the
  // stored entity stays consistent — serialization overlays entity.metadata
  // onto content frontmatter, so stale metadata would undo the edit.
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);
  const entity: BaseEntity = {
    ...existing,
    ...parsed,
    id: existing.id,
    entityType: existing.entityType,
    content,
  };

  const result = await context.entityService.updateEntity({ entity });
  return jsonResponse({ entityId: result.entityId, jobId: result.jobId });
}

async function handleCreateEntity(
  context: ServicePluginContext,
  request: Request,
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

  const bodyError = rejectBodyForBodylessType(
    context,
    entityType,
    payload.body,
  );
  if (bodyError) return bodyError;

  const raw = isRawEntityType(entityType);
  if (raw && Object.keys(payload.frontmatter).length > 0) {
    return jsonResponse(
      {
        error: `Entity type ${entityType} is raw markdown without frontmatter`,
      },
      400,
    );
  }

  const frontmatter = raw
    ? { success: true as const, data: {} }
    : schema.safeParse(payload.frontmatter);
  if (!frontmatter.success) {
    return jsonResponse(
      { error: "Invalid frontmatter", issues: frontmatter.error.issues },
      400,
    );
  }

  const content = raw
    ? (payload.body ?? "")
    : generateMarkdownWithFrontmatter(payload.body ?? "", frontmatter.data);
  const parsed = context.entities.getAdapter(entityType)?.fromMarkdown(content);

  // No id: the entity service derives one, keeping id policy server-side.
  const result = await context.entityService.createEntity({
    entity: {
      ...parsed,
      entityType,
      content,
      metadata: parsed?.metadata ?? {},
    },
  });

  return jsonResponse({ entityId: result.entityId, jobId: result.jobId }, 201);
}

async function handleDeleteEntity(
  context: ServicePluginContext,
  request: Request,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }

  const existing = await context.entityService.getEntity({ entityType, id });
  if (!existing) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }

  const deleted = await context.entityService.deleteEntity({ entityType, id });
  return jsonResponse({ deleted });
}

/**
 * Store the uploaded bytes in the shared runtime upload store, then promote
 * them through the upload-save handler the owning entity plugin registered
 * (images: the `image` plugin's promotion pipeline). The editor never
 * writes media entities itself — the pipeline stays the single owner.
 */
async function handleUpload(
  context: ServicePluginContext,
  request: Request,
  routePath: string,
): Promise<Response> {
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: "Upload too large" }, 400);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart upload" }, 400);
  }

  const file = form.get(UPLOAD_FORM_FIELD);
  if (!(file instanceof File)) {
    return jsonResponse({ error: "Missing upload file" }, 400);
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: "Upload too large" }, 400);
  }

  const registration = context.entities.getUploadSaveHandler(file.type);
  if (!registration) {
    return jsonResponse(
      { error: `No handler accepts uploads of type ${file.type}` },
      415,
    );
  }

  const store = context.uploads.scoped({
    namespace: "upload",
    refKind: "upload",
    routePath,
  });
  const record = await store.save({
    filename: file.name,
    mediaType: file.type,
    content: Buffer.from(await file.arrayBuffer()),
  });

  const result = await registration.handler(
    { upload: { kind: "upload", id: record.id } },
    { interfaceType: "cms", userId: "operator" },
  );

  if (!result.success) {
    return jsonResponse({ error: result.error }, 502);
  }
  return jsonResponse(
    { entityId: result.data.entityId, jobId: result.data.jobId },
    201,
  );
}

function rejectBodyForBodylessType(
  context: ServicePluginContext,
  entityType: string,
  body: string | undefined,
): Response | null {
  if (body === undefined) return null;
  const adapter = context.entities.getAdapter(entityType);
  if (adapter?.hasBody === false) {
    return jsonResponse(
      { error: `Entity type ${entityType} does not have a body` },
      400,
    );
  }
  return null;
}

function splitEntityContent(
  entityType: string,
  content: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  // Raw types never carry frontmatter — a leading `---` is a horizontal
  // rule and must not be parsed as a YAML delimiter.
  if (isRawEntityType(entityType)) {
    return { frontmatter: {}, body: content };
  }
  try {
    const parsed = parseMarkdownWithFrontmatter(
      content,
      z.record(z.string(), z.unknown()),
    );
    return { frontmatter: parsed.metadata, body: parsed.content };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
