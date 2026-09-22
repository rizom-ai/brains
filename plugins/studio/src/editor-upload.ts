import {
  captureRequestUpload,
  AcknowledgedRuntimeUploadError,
  type ServicePluginContext,
} from "@brains/plugins";
import {
  recordStudioMutationAudit,
  requireEntityAction,
} from "./editor-access";
import type {
  StudioRequestAccess,
  EditorRouteOptions,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";

const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export async function handleUpload(
  context: ServicePluginContext,
  request: Request,
  routePath: string,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  request.signal.throwIfAborted();
  const declaredSize = Number(request.headers.get("content-length"));
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > UPLOAD_MAX_BYTES
  )
    return jsonResponse({ error: "Upload too large" }, 400);
  const encodedFilename = request.headers.get("X-Upload-Filename");
  if (encodedFilename === null || encodedFilename.length > 3072)
    return jsonResponse({ error: "Missing or invalid upload filename" }, 400);
  let filename: string;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    return jsonResponse({ error: "Invalid upload filename encoding" }, 400);
  }
  if (!filename || filename.length > 255)
    return jsonResponse({ error: "Invalid upload filename" }, 400);
  const mediaType =
    request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() ?? "application/octet-stream";
  if (mediaType.length > 128 || mediaType === "multipart/form-data")
    return jsonResponse({ error: "Unsupported upload type" }, 415);
  const registration = context.entities.getUploadSaveHandler(mediaType);
  if (!registration)
    return jsonResponse(
      { error: `No handler accepts uploads of type ${mediaType}` },
      415,
    );
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
  const files = context.entityService.fileAssets;
  if (!files) throw new Error("Studio upload capture is not provisioned");
  const store = context.uploads.scoped({
    namespace: "upload",
    refKind: "upload",
    routePath,
  });
  // Retain the native capture before invoking the registered entity handler.
  // That handler owns content inspection/publication, not the MIME declaration.
  const record = await captureRequestUpload(
    request,
    { filename, mediaType, maxBytes: UPLOAD_MAX_BYTES },
    files,
    store,
  ).catch((error: unknown) => {
    if (
      error instanceof Error &&
      Object.getOwnPropertyDescriptor(error, "code")?.value ===
        "FILE_SIZE_LIMIT"
    )
      return undefined;
    throw error; // Includes acknowledged captures: never start a later stage after retirement failure.
  });
  if (!record) return jsonResponse({ error: "Upload too large" }, 400);
  if (request.signal.aborted)
    throw new AcknowledgedRuntimeUploadError(record, request.signal.reason);

  let result: Awaited<ReturnType<typeof registration.handler>>;
  try {
    result = await registration.handler(
      { upload: { kind: "upload", id: record.id } },
      { interfaceType: "studio", actor: access.actor },
    );
  } catch (error) {
    // Submission may have succeeded. Keep recovery evidence and never replay.
    try {
      context.logger.error("Studio upload promotion outcome unknown", {
        uploadId: record.id,
        error,
      });
    } catch (reportingError) {
      throw new AcknowledgedRuntimeUploadError(
        record,
        new AggregateError(
          [error, reportingError],
          "Studio upload promotion and reporting failed",
          { cause: error },
        ),
      );
    }
    return jsonResponse(
      { error: "Upload promotion failed", upload: record.ref },
      502,
    );
  }
  if (!result.success)
    return jsonResponse({ error: result.error, upload: record.ref }, 502);
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
