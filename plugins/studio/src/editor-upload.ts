import type { ServicePluginContext } from "@brains/plugins";
import {
  recordStudioMutationAudit,
  requireEntityAction,
} from "./editor-access";
import type {
  StudioRequestAccess,
  EditorRouteOptions,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";

const UPLOAD_FORM_FIELD = "file";
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export async function handleUpload(
  context: ServicePluginContext,
  request: Request,
  routePath: string,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
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
  const actionError = requireEntityAction(
    context,
    registration.entityType,
    "create",
    access,
  );
  if (actionError) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "upload",
      "denied",
      registration.entityType,
      undefined,
      "entity-action-policy",
    );
    return actionError;
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

  let result: Awaited<ReturnType<typeof registration.handler>>;
  try {
    result = await registration.handler(
      { upload: { kind: "upload", id: record.id } },
      {
        interfaceType: "studio",
        actor: access.actor,
      },
    );
  } catch {
    await store.remove(record.id);
    return jsonResponse({ error: "Upload promotion failed" }, 502);
  }

  if (!result.success) {
    await store.remove(record.id);
    return jsonResponse({ error: result.error }, 502);
  }
  await recordStudioMutationAudit(
    recordAuditEvent,
    access,
    "upload",
    "allowed",
    registration.entityType,
    result.data.entityId,
  );
  return jsonResponse(
    { entityId: result.data.entityId, jobId: result.data.jobId },
    201,
  );
}
