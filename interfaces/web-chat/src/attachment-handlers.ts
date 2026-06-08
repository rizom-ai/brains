import type { InterfacePluginContext } from "@brains/plugins";

type OperatorSessionResolver = (request: Request) => Promise<boolean>;
type EntityService = InterfacePluginContext["entityService"];

interface AttachmentHandlerDeps {
  resolveOperatorSession: OperatorSessionResolver;
  createOperatorLoginRequiredResponse: (request: Request) => Response;
  entityService: EntityService;
}

export async function handleDocumentAttachmentRequest(
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveOperatorSession(request))) {
    return deps.createOperatorLoginRequiredResponse(request);
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get("id")?.trim();
  if (!documentId) {
    return new Response("Missing document id", { status: 400 });
  }

  const document = await deps.entityService.getEntity({
    entityType: "document",
    id: documentId,
  });
  if (!document) {
    return new Response("Document not found", { status: 404 });
  }

  const parsed = parsePdfDataUrl(document.content);
  if (!parsed) {
    return new Response("Document content is not a PDF", { status: 415 });
  }

  const filename = getDocumentFilename(document.metadata, documentId);
  return createBinaryAttachmentResponse({
    requestUrl: url,
    data: parsed.data,
    mediaType: parsed.mimeType,
    filename,
  });
}

export async function handleImageAttachmentRequest(
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveOperatorSession(request))) {
    return deps.createOperatorLoginRequiredResponse(request);
  }

  const url = new URL(request.url);
  const imageId = url.searchParams.get("id")?.trim();
  if (!imageId) {
    return new Response("Missing image id", { status: 400 });
  }

  const image = await deps.entityService.getEntity({
    entityType: "image",
    id: imageId,
  });
  if (!image) {
    return new Response("Image not found", { status: 404 });
  }

  const parsed = parseImageDataUrl(image.content);
  if (!parsed) {
    return new Response("Image content is not an image", { status: 415 });
  }

  const filename = getImageFilename(image.metadata, imageId, parsed.mimeType);
  return createBinaryAttachmentResponse({
    requestUrl: url,
    data: parsed.data,
    mediaType: parsed.mimeType,
    filename,
  });
}

function createBinaryAttachmentResponse(input: {
  requestUrl: URL;
  data: ArrayBuffer;
  mediaType: string;
  filename: string;
}): Response {
  const headers = new Headers({
    "Content-Type": input.mediaType,
    "Content-Length": String(input.data.byteLength),
    "Content-Disposition": `${
      input.requestUrl.searchParams.has("download") ? "attachment" : "inline"
    }; filename="${escapeHeaderValue(input.filename)}"`,
  });
  return new Response(input.data, { headers });
}

function parseBase64DataUrl(
  dataUrl: string,
  mediaTypePattern: RegExp,
): { mimeType: string; data: ArrayBuffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  const [, mimeType, encoded] = match;
  if (!mimeType || !encoded || !mediaTypePattern.test(mimeType)) {
    return null;
  }
  const buffer = Buffer.from(encoded, "base64");
  const data = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return {
    mimeType,
    data,
  };
}

function parsePdfDataUrl(
  dataUrl: string,
): { mimeType: "application/pdf"; data: ArrayBuffer } | null {
  const parsed = parseBase64DataUrl(dataUrl, /^application\/pdf$/i);
  if (parsed?.mimeType.toLowerCase() !== "application/pdf") {
    return null;
  }
  return { mimeType: "application/pdf", data: parsed.data };
}

function parseImageDataUrl(
  dataUrl: string,
): { mimeType: string; data: ArrayBuffer } | null {
  return parseBase64DataUrl(dataUrl, /^image\/[a-z0-9.+-]+$/i);
}

function getDocumentFilename(
  metadata: Record<string, unknown> | null | undefined,
  documentId: string,
): string {
  const filename = metadata?.["filename"];
  return typeof filename === "string" && filename.length > 0
    ? filename
    : `${documentId}.pdf`;
}

function getImageFilename(
  metadata: Record<string, unknown> | null | undefined,
  imageId: string,
  mimeType: string,
): string {
  const filename = metadata?.["filename"];
  if (typeof filename === "string" && filename.length > 0) return filename;

  const format = metadata?.["format"];
  if (typeof format === "string" && format.length > 0) {
    return `${imageId}.${format === "jpeg" ? "jpg" : format}`;
  }

  const subtype = mimeType.split("/")[1];
  return `${imageId}.${subtype && subtype.length > 0 ? subtype : "png"}`;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}
