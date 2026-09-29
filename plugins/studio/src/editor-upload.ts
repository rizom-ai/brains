import type { OperatorEntityWrites } from "@brains/sdk/services";
import { recordStudioMutationAudit } from "./editor-access";
import type {
  StudioAuditRecorder,
  StudioRequestAccess,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";

const UPLOAD_FORM_FIELD = "file";
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A file arrives and becomes an entity of whichever type declared it takes
 * that kind of file. The editor never decides what the file becomes: the
 * runtime stages the bytes and hands them to the type's own handler as the
 * person who sent them, and this reports what came back.
 */
export async function handleUpload(
  operator: OperatorEntityWrites,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: StudioAuditRecorder,
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

  const outcome = await operator.upload(
    {
      filename: file.name,
      mediaType: file.type,
      content: Buffer.from(await file.arrayBuffer()),
    },
    access.caller,
  );

  switch (outcome.kind) {
    case "denied":
      if (outcome.reason === "unsupported-media-type") {
        return jsonResponse({ error: outcome.message }, 415);
      }
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "upload",
        "denied",
        outcome.entityType,
        undefined,
        outcome.reason,
      );
      return jsonResponse({ error: outcome.message }, 403);
    case "refused":
      // The reason stays server-side: the handler's message is for the
      // operator, and the promotion pipeline's internals are not.
      return jsonResponse({ error: outcome.message }, 502);
    case "created":
      await recordStudioMutationAudit(
        recordAuditEvent,
        access,
        "upload",
        "allowed",
        outcome.entityType,
        outcome.entityId,
      );
      return jsonResponse(
        { entityId: outcome.entityId, jobId: outcome.jobId },
        201,
      );
  }
}
