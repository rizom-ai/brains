import {
  RuntimeUploadStoreError,
  type ChatAttachment,
  type ResolvedRuntimeUpload,
  type RuntimeUploadRecord,
  type RuntimeUploadStore,
} from "@brains/plugins";
import {
  defaultWebChatUploadFilename,
  sanitizeUploadFilename,
  validateWebChatUpload,
  webChatUploadMaxBytes,
  type ValidatedWebChatUpload,
} from "./upload-policy";
import { webChatUploadRefKind } from "./upload-store";

const webChatUploadFormField = "file";
/* Extra slack over the text-file size limit to cover the multipart envelope
   (boundary, headers) when guarding on Content-Length before buffering. */
const webChatUploadEnvelopeSlackBytes = 16_384;

type OperatorSessionResolver = (request: Request) => Promise<boolean>;

interface UploadHandlerDeps {
  resolveOperatorSession: OperatorSessionResolver;
  getUploadStore: () => RuntimeUploadStore;
}

export async function handleUploadRequest(
  request: Request,
  deps: UploadHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveOperatorSession(request))) {
    return new Response("Forbidden", { status: 403 });
  }

  // Reject obviously oversized bodies before buffering the whole upload into
  // memory. Best-effort: Content-Length may be absent, so the post-decode
  // size check below remains authoritative.
  const declaredSize = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredSize) &&
    declaredSize > webChatUploadMaxBytes + webChatUploadEnvelopeSlackBytes
  ) {
    return new Response("File upload too large", { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid multipart upload", { status: 400 });
  }

  const file = formData.get(webChatUploadFormField);
  if (!(file instanceof File)) {
    return new Response("Missing upload file", { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateWebChatUpload({
    filename: file.name,
    mediaType: file.type,
    content: buffer,
  });
  if (!validated.ok) {
    return new Response(validated.message, { status: 400 });
  }

  const store = deps.getUploadStore();
  const record = await store.save({
    filename: validated.filename,
    mediaType: validated.mediaType,
    content: buffer,
  });

  return Response.json(store.toResponseBody(record), { status: 201 });
}

export async function handleUploadDownloadRequest(
  request: Request,
  deps: UploadHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveOperatorSession(request))) {
    return new Response("Forbidden", { status: 403 });
  }

  const uploadId = new URL(request.url).searchParams.get("id")?.trim();
  if (!uploadId) {
    return new Response("Missing upload id", { status: 400 });
  }

  const resolved = await readStoredUpload(uploadId, deps.getUploadStore());
  if (resolved instanceof Response) return resolved;
  const { record, content } = resolved;

  const validated = validateStoredUpload(record, content);
  if (validated instanceof Response) return validated;

  const disposition = new URL(request.url).searchParams.has("download")
    ? "attachment"
    : "inline";
  const body = new Uint8Array(content).buffer;
  return new Response(body, {
    headers: {
      "Content-Type": record.mediaType,
      "Content-Length": String(content.byteLength),
      "Content-Disposition": `${disposition}; filename="${escapeHeaderValue(
        record.filename,
      )}"`,
    },
  });
}

export function resolveInlineUploadPart(file: {
  filename?: string | undefined;
  mediaType?: string | undefined;
  url: string;
}): ChatAttachment | Response {
  const filename = sanitizeUploadFilename(
    file.filename ?? defaultWebChatUploadFilename,
  );
  const decoded = decodeUploadedDataUrl(file.url);
  if (!decoded) {
    return new Response(`Unsupported file upload URL: ${filename}`, {
      status: 400,
    });
  }

  const validated = validateWebChatUpload({
    filename,
    mediaType: file.mediaType,
    content: decoded.buffer,
  });
  if (!validated.ok) {
    return new Response(validated.message, { status: 400 });
  }

  return toChatAttachment(validated, decoded.buffer);
}

export async function resolveReferencedUpload(
  uploadId: string,
  uploadStore: RuntimeUploadStore,
): Promise<ChatAttachment | Response> {
  const resolved = await readStoredUpload(uploadId, uploadStore);
  if (resolved instanceof Response) return resolved;

  const { record, content } = resolved;
  const validated = validateStoredUpload(record, content);
  if (validated instanceof Response) return validated;

  return toChatAttachment(validated, content, {
    kind: webChatUploadRefKind,
    id: uploadId,
  });
}

async function readStoredUpload(
  uploadId: string,
  uploadStore: RuntimeUploadStore,
): Promise<ResolvedRuntimeUpload | Response> {
  try {
    return await uploadStore.read(uploadId);
  } catch (error) {
    if (error instanceof RuntimeUploadStoreError) {
      return uploadStoreErrorToResponse(error);
    }
    throw error;
  }
}

function validateStoredUpload(
  record: RuntimeUploadRecord,
  content: Buffer,
): ValidatedWebChatUpload | Response {
  const validated = validateWebChatUpload({
    filename: record.filename,
    mediaType: record.mediaType,
    content,
  });
  if (!validated.ok) {
    return new Response(validated.message, { status: 400 });
  }
  return validated;
}

function toChatAttachment(
  upload: ValidatedWebChatUpload,
  content: Uint8Array,
  source?: ChatAttachment["source"],
): ChatAttachment {
  if (upload.kind === "text") {
    return {
      kind: "text",
      filename: upload.filename,
      mediaType: upload.mediaType,
      content: upload.text,
      sizeBytes: upload.sizeBytes,
      ...(source !== undefined ? { source } : {}),
    };
  }

  return {
    kind: "file",
    filename: upload.filename,
    mediaType: upload.mediaType,
    data: new Uint8Array(content),
    sizeBytes: upload.sizeBytes,
    ...(source !== undefined ? { source } : {}),
  };
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

function decodeUploadedDataUrl(
  url: string,
): { buffer: Buffer; byteLength: number } | null {
  const match = /^data:[^,]*,(.*)$/s.exec(url);
  if (!match) return null;

  const metadata = url.slice(5, url.indexOf(","));
  const isBase64 = metadata
    .split(";")
    .some((part) => part.toLowerCase() === "base64");
  try {
    const buffer = isBase64
      ? Buffer.from(match[1] ?? "", "base64")
      : Buffer.from(decodeURIComponent(match[1] ?? ""), "utf8");
    return { buffer, byteLength: buffer.byteLength };
  } catch {
    return null;
  }
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}
