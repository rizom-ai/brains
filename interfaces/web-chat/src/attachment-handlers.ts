import {
  assetRefSchema,
  formatContentDispositionHeader,
  getArtifactEntityFilename,
  parseArtifactDataUrl,
  resolveMessageArtifactAccess,
  type InterfacePluginContext,
  type UserPermissionLevel,
} from "@brains/plugins";

type PermissionLevelResolver = (
  request: Request,
) => Promise<UserPermissionLevel>;
type EntityService = InterfacePluginContext["entityService"];
type ArtifactEntityType = "document" | "image";

interface AttachmentHandlerDeps {
  resolvePermissionLevel: PermissionLevelResolver;
  createAuthLoginRequiredResponse: (request: Request) => Response;
  entityService: EntityService;
}

export async function handleDocumentAttachmentRequest(
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel === "public") {
    return deps.createAuthLoginRequiredResponse(request);
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get("id")?.trim();
  if (!documentId) {
    return new Response("Missing document id", { status: 400 });
  }

  const document = await resolveVisibleArtifactEntity({
    entityType: "document",
    id: documentId,
    permissionLevel,
    entityService: deps.entityService,
  });
  if (!document) {
    return new Response("Document not found", { status: 404 });
  }
  if (typeof document.content !== "string") {
    return new Response("Document content is not a PDF", { status: 415 });
  }

  const parsed = parseArtifactDataUrl("document", document.content);
  if (!parsed) {
    return new Response("Document content is not a PDF", { status: 415 });
  }

  const filename = getArtifactEntityFilename(
    document.metadata,
    documentId,
    "document",
    parsed.mimeType,
  );
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
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel === "public") {
    return deps.createAuthLoginRequiredResponse(request);
  }

  const url = new URL(request.url);
  const imageId = url.searchParams.get("id")?.trim();
  if (!imageId) {
    return new Response("Missing image id", { status: 400 });
  }

  const image = await resolveVisibleArtifactEntity({
    entityType: "image",
    id: imageId,
    permissionLevel,
    entityService: deps.entityService,
  });
  if (!image) {
    return new Response("Image not found", { status: 404 });
  }
  if (typeof image.content !== "string") {
    return new Response("Image content is not an image", { status: 415 });
  }

  const assetRef = assetRefSchema.safeParse(image.content);
  if (assetRef.success) {
    const mediaType = image.metadata?.["mediaType"];
    if (typeof mediaType !== "string" || !mediaType.startsWith("image/")) {
      return new Response("Image content is not an image", { status: 415 });
    }
    const sizeBytes = image.metadata?.["sizeBytes"];
    return createStreamingAttachmentResponse({
      requestUrl: url,
      chunks: await deps.entityService.openAsset(assetRef.data),
      mediaType,
      ...(typeof sizeBytes === "number" && { sizeBytes }),
      filename: getArtifactEntityFilename(
        image.metadata,
        imageId,
        "image",
        mediaType,
      ),
    });
  }

  const parsed = parseArtifactDataUrl("image", image.content);
  if (!parsed) {
    return new Response("Image content is not an image", { status: 415 });
  }

  const filename = getArtifactEntityFilename(
    image.metadata,
    imageId,
    "image",
    parsed.mimeType,
  );
  return createBinaryAttachmentResponse({
    requestUrl: url,
    data: parsed.data,
    mediaType: parsed.mimeType,
    filename,
  });
}

async function resolveVisibleArtifactEntity(input: {
  entityType: ArtifactEntityType;
  id: string;
  permissionLevel: UserPermissionLevel;
  entityService: EntityService;
}): Promise<
  | {
      content: unknown;
      metadata: Record<string, unknown> | null | undefined;
    }
  | undefined
> {
  const entityRef = { entityType: input.entityType, id: input.id };
  const access = await resolveMessageArtifactAccess({
    entityRef,
    userLevel: input.permissionLevel,
    // Access checks read references; bytes load only for the response.
    getEntity: (ref) =>
      input.entityService.getEntity({ ...ref, binaryContent: "reference" }),
    getVisibleEntity: (ref, visibilityScope) =>
      input.entityService.getEntity({
        ...ref,
        visibilityScope,
        binaryContent: "reference",
      }),
  });

  return access.status === "visible" ? access.entity : undefined;
}

function contentDisposition(requestUrl: URL, filename: string): string {
  return formatContentDispositionHeader({
    disposition: requestUrl.searchParams.has("download")
      ? "attachment"
      : "inline",
    filename,
  });
}

/** Stream stored chunks without holding the whole asset in memory. */
function createStreamingAttachmentResponse(input: {
  requestUrl: URL;
  chunks: AsyncIterable<Uint8Array>;
  mediaType: string;
  sizeBytes?: number;
  filename: string;
}): Response {
  const iterator = input.chunks[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
  const headers = new Headers({
    "Content-Type": input.mediaType,
    "Content-Disposition": contentDisposition(input.requestUrl, input.filename),
  });
  if (input.sizeBytes !== undefined) {
    headers.set("Content-Length", String(input.sizeBytes));
  }
  return new Response(body, { headers });
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
    "Content-Disposition": contentDisposition(input.requestUrl, input.filename),
  });
  return new Response(input.data, { headers });
}
