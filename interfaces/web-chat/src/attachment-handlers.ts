import {
  assetRefSchema,
  getAssetDigest,
  MAX_ASSET_BYTES,
} from "@brains/assets";
import { z } from "@brains/utils/zod";
import {
  createFileResponse,
  formatContentDispositionHeader,
  getArtifactEntityFilename,
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
  fileTransfers: InterfacePluginContext["fileTransfers"];
  onRetirementError: (error: unknown) => void;
}
const sizeSchema = z.number().int().positive().max(MAX_ASSET_BYTES);
const imageMimeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export function handleDocumentAttachmentRequest(
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  return handleArtifactAttachmentRequest("document", request, deps);
}
export function handleImageAttachmentRequest(
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  return handleArtifactAttachmentRequest("image", request, deps);
}
async function handleArtifactAttachmentRequest(
  kind: ArtifactEntityType,
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel === "public")
    return deps.createAuthLoginRequiredResponse(request);
  request.signal.throwIfAborted();
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return new Response(`Missing ${kind} id`, { status: 400 });
  const entity = await resolveVisibleArtifactEntity({
    entityType: kind,
    id,
    permissionLevel,
    entityService: deps.entityService,
  });
  request.signal.throwIfAborted();
  const label = kind === "document" ? "Document" : "Image";
  if (!entity) return new Response(`${label} not found`, { status: 404 });
  const metadata = entity.metadata ?? {};
  if (metadata["status"] === "pending" || metadata["status"] === "failed")
    return new Response(`${label} is not ready`, { status: 409 });
  const ref = assetRefSchema.safeParse(entity.content);
  const size = sizeSchema.safeParse(metadata["sizeBytes"]);
  const mime =
    kind === "document"
      ? z.literal("application/pdf").safeParse(metadata["mimeType"])
      : imageMimeSchema.safeParse(metadata["mediaType"]);
  if (!ref.success || !size.success || !mime.success)
    return new Response(`${label} requires a valid file asset`, {
      status: 415,
    });
  const record = await deps.entityService.statAsset(ref.data);
  if (!record) return new Response(`${label} asset not found`, { status: 404 });
  const stat = z
    .strictObject({ ref: assetRefSchema, sizeBytes: sizeSchema })
    .parse(record);
  request.signal.throwIfAborted();
  if (stat.ref !== ref.data || stat.sizeBytes !== size.data)
    throw new Error("Attachment metadata does not match its asset record");
  const filename = getArtifactEntityFilename(metadata, id, kind, mime.data);
  const headers = new Headers({
    "Content-Type": mime.data,
    "Content-Length": String(stat.sizeBytes),
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": formatContentDispositionHeader({
      disposition: url.searchParams.has("download") ? "attachment" : "inline",
      filename,
    }),
  });
  // HEAD cannot rely on the HTTP server pulling/discarding a borrowed body.
  if (request.method === "HEAD") return new Response(null, { headers });
  const reader = deps.entityService.fileAssets;
  const transfers = deps.fileTransfers;
  if (!reader || !transfers)
    throw new Error("HTTP attachment file delivery is not provisioned");
  return createFileResponse({
    headers,
    signal: request.signal,
    files: transfers,
    onRetirementError: deps.onRetirementError,
    withFile: (use, signal): Promise<void> =>
      reader.withAssetFile(
        ref.data,
        async (file, ownedSignal): Promise<void> => {
          if (
            file.sha256 !== getAssetDigest(stat.ref) ||
            file.sizeBytes !== stat.sizeBytes
          )
            throw new Error("Attachment loan does not match its asset record");
          return use(file, ownedSignal);
        },
        { signal },
      ),
  });
}
async function resolveVisibleArtifactEntity(input: {
  entityType: ArtifactEntityType;
  id: string;
  permissionLevel: UserPermissionLevel;
  entityService: EntityService;
}): Promise<
  | { content: unknown; metadata: Record<string, unknown> | null | undefined }
  | undefined
> {
  const entityRef = { entityType: input.entityType, id: input.id };
  const access = await resolveMessageArtifactAccess({
    entityRef,
    userLevel: input.permissionLevel,
    getEntity: (ref) => input.entityService.getEntity(ref),
    getVisibleEntity: (ref, visibilityScope) =>
      input.entityService.getEntity({ ...ref, visibilityScope }),
  });
  return access.status === "visible" ? access.entity : undefined;
}
