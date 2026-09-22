import {
  chatUploadResponseSchema,
  CHAT_UPLOAD_FILENAME_HEADER,
} from "@brains/contracts/chat";
import {
  RuntimeUploadStoreError,
  AcknowledgedRuntimeUploadError,
  captureRequestUpload,
  createFileResponse,
  formatContentDispositionHeader,
  type InterfacePluginContext,
  type ChatAttachment,
  type RuntimeUploadRecord,
  type ScopedRuntimeUploadStore,
} from "@brains/plugins";
import {
  sanitizeUploadFilename,
  webChatUploadMaxBytes,
  webChatTextUploadMaxBytes,
  normalizeWebChatUploadMediaType,
} from "./upload-policy";
import { webChatUploadRefKind } from "./upload-store";
import { uploadInspectionDetailsSchema } from "@brains/plugins/message-interface/upload-inspection";
import {
  validateMessageUploadFacts,
  getMessageUploadKind,
} from "@brains/plugins/message-interface/upload-policy";

type AuthSessionResolver = (request: Request) => Promise<boolean>;

interface UploadHandlerDeps {
  resolveAuthSession: AuthSessionResolver;
  getUploadStore: () => ScopedRuntimeUploadStore;
  fileTransfers: InterfacePluginContext["fileTransfers"];
  onRetirementError: (error: unknown) => void;
}

export async function handleUploadRequest(
  request: Request,
  deps: UploadHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveAuthSession(request))) {
    return new Response("Forbidden", { status: 403 });
  }

  request.signal.throwIfAborted();
  const encodedFilename = request.headers.get(CHAT_UPLOAD_FILENAME_HEADER);
  if (encodedFilename === null || encodedFilename.length > 3072)
    return new Response("Missing or invalid upload filename", { status: 400 });
  let filename: string;
  try {
    filename = sanitizeUploadFilename(decodeURIComponent(encodedFilename));
  } catch {
    return new Response("Invalid upload filename encoding", { status: 400 });
  }
  const mediaType = normalizeWebChatUploadMediaType(
    filename,
    request.headers.get("Content-Type") ?? undefined,
  );
  const kind = getMessageUploadKind(filename, mediaType);
  if (!kind || mediaType.length > 128 || mediaType === "multipart/form-data")
    return new Response(`Unsupported file upload type: ${filename}`, {
      status: 400,
    });
  const maxBytes =
    kind === "text" ? webChatTextUploadMaxBytes : webChatUploadMaxBytes;
  const declaredSize = Number(request.headers.get("Content-Length"));
  if (
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 0 ||
    declaredSize > maxBytes
  )
    return new Response("File upload too large", { status: 400 });
  const files = deps.fileTransfers;
  if (!files) throw new Error("Upload file capture is not provisioned");
  const store = deps.getUploadStore();
  let record: RuntimeUploadRecord;
  try {
    record = await captureRequestUpload(
      request,
      { filename, mediaType, maxBytes },
      files,
      store,
      {
        validateFile: async (file, signal): Promise<void> => {
          const inspection = await files.inspect(
            { sourceFile: file.sourceFile, sizeBytes: file.sizeBytes },
            { signal, inspector: "message-upload" },
          );
          if (
            inspection.sizeBytes !== file.sizeBytes ||
            inspection.sha256 !== file.sha256
          )
            throw new Error("Captured upload changed before inspection");
          const details = uploadInspectionDetailsSchema.parse(
            inspection.details,
          );
          const validated = validateMessageUploadFacts({
            filename,
            mediaType,
            sizeBytes: inspection.sizeBytes,
            ...details,
          });
          if (!validated.ok) throw new UploadPolicyError(validated.message);
        },
      },
    );
  } catch (error) {
    if (error instanceof UploadPolicyError)
      return new Response(error.message, { status: 400 });
    // Only an unaccompanied typed native limit failure is a policy response;
    // aggregate transport/retirement failures retain their complete graph.
    if (
      error instanceof Error &&
      Object.getOwnPropertyDescriptor(error, "code")?.value ===
        "FILE_SIZE_LIMIT"
    )
      return new Response("File upload too large", { status: 400 });
    if (!(error instanceof AcknowledgedRuntimeUploadError)) throw error;
    record = error.record;
    try {
      deps.onRetirementError(error);
    } catch (reportingError) {
      throw new AcknowledgedRuntimeUploadError(
        record,
        new AggregateError(
          [error, reportingError],
          "Upload acknowledgement reporting failed",
          { cause: error },
        ),
      );
    }
  }

  return Response.json(
    chatUploadResponseSchema.parse(store.toResponseBody(record)),
    { status: 201 },
  );
}

class UploadPolicyError extends Error {}

export async function handleUploadDownloadRequest(
  request: Request,
  deps: UploadHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveAuthSession(request))) {
    return new Response("Forbidden", { status: 403 });
  }

  const uploadId = new URL(request.url).searchParams.get("id")?.trim();
  if (!uploadId) {
    return new Response("Missing upload id", { status: 400 });
  }

  request.signal.throwIfAborted();
  const headers = new Headers();
  const store = deps.getUploadStore();
  try {
    await store.readRecord(uploadId);
  } catch (error) {
    if (error instanceof RuntimeUploadStoreError)
      return uploadStoreErrorToResponse(error);
    throw error;
  }
  request.signal.throwIfAborted();
  const files = deps.fileTransfers;
  if (!files) throw new Error("Upload file delivery is not provisioned");
  const withValidatedFile = async <T>(
    use: (
      file: { sourceFile: string; sizeBytes: number; sha256: string },
      signal: AbortSignal,
    ) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> =>
    store.withFile(uploadId, async ({ record, sourceFile }): Promise<T> => {
      signal.throwIfAborted();
      const inspection = await files.inspect(
        { sourceFile, sizeBytes: record.sizeBytes },
        { signal, inspector: "message-upload" },
      );
      signal.throwIfAborted();
      if (inspection.sizeBytes !== record.sizeBytes)
        throw new Error("Upload inspection size does not match its record");
      const details = uploadInspectionDetailsSchema.parse(inspection.details);
      const validated = validateMessageUploadFacts({
        filename: record.filename,
        mediaType: record.mediaType,
        sizeBytes: inspection.sizeBytes,
        ...details,
      });
      if (!validated.ok) throw new UploadPolicyError(validated.message);
      headers.set("Content-Type", validated.mediaType);
      headers.set("Content-Length", String(inspection.sizeBytes));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set(
        "Content-Disposition",
        formatContentDispositionHeader({
          disposition: new URL(request.url).searchParams.has("download")
            ? "attachment"
            : "inline",
          filename: validated.filename,
        }),
      );
      return use(
        {
          sourceFile,
          sizeBytes: inspection.sizeBytes,
          sha256: inspection.sha256,
        },
        signal,
      );
    });
  try {
    if (request.method === "HEAD")
      return await withValidatedFile(
        async (): Promise<Response> => new Response(null, { headers }),
        request.signal,
      );
    return await createFileResponse({
      headers,
      signal: request.signal,
      files,
      withFile: withValidatedFile,
      onRetirementError: deps.onRetirementError,
    });
  } catch (error) {
    if (error instanceof RuntimeUploadStoreError)
      return uploadStoreErrorToResponse(error);
    if (error instanceof UploadPolicyError)
      return new Response(error.message, { status: 400 });
    throw error;
  }
}

export async function resolveReferencedUpload(
  uploadId: string,
  uploadStore: ScopedRuntimeUploadStore,
  files: InterfacePluginContext["fileTransfers"],
  signal: AbortSignal,
): Promise<ChatAttachment | Response> {
  signal.throwIfAborted();
  try {
    await uploadStore.readRecord(uploadId);
    signal.throwIfAborted();
    if (!files) throw new Error("Upload inspection is not provisioned");
    return await uploadStore.withFile(
      uploadId,
      async ({ record, sourceFile }): Promise<ChatAttachment | Response> => {
        const facts = await files.inspect(
          { sourceFile, sizeBytes: record.sizeBytes },
          { inspector: "message-upload", signal },
        );
        signal.throwIfAborted();
        if (facts.sizeBytes !== record.sizeBytes)
          throw new Error("Upload inspection size does not match its record");
        const details = uploadInspectionDetailsSchema.parse(facts.details);
        const validated = validateMessageUploadFacts({
          filename: record.filename,
          mediaType: record.mediaType,
          sizeBytes: facts.sizeBytes,
          ...details,
        });
        if (!validated.ok)
          return new Response(validated.message, { status: 400 });
        return {
          kind: "file",
          filename: validated.filename,
          mediaType: validated.mediaType,
          sizeBytes: facts.sizeBytes,
          source: { kind: webChatUploadRefKind, id: uploadId },
        };
      },
    );
  } catch (error) {
    if (error instanceof RuntimeUploadStoreError)
      return uploadStoreErrorToResponse(error);
    throw error;
  }
}

function uploadStoreErrorToResponse(error: RuntimeUploadStoreError): Response {
  switch (error.code) {
    case "invalid_ref":
      return new Response("Invalid upload ref", { status: 400 });
    case "invalid_metadata":
      return new Response("Invalid upload metadata", { status: 500 });
    case "not_found":
      return new Response("Upload not found", { status: 404 });
  }
}
