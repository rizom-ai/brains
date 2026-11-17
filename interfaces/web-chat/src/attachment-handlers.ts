import {
  createArtifactResponse,
  type InterfaceRuntime,
  resolveMessageArtifactAccess,
} from "@brains/sdk/internal/interface-runtime";
import type { UserPermissionLevel } from "@brains/sdk/interfaces";

type PermissionLevelResolver = (
  request: Request,
) => Promise<UserPermissionLevel>;
type EntityService = InterfaceRuntime["entityReads"];
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
  // Only the reference of the record read at the caller's scope is opened:
  // bytes shared with another document never answer for this one.
  const response = await createArtifactResponse(deps.entityService, {
    entityType: "document",
    id: documentId,
    entity: document,
    disposition: url.searchParams.has("download") ? "attachment" : "inline",
  });
  return (
    response ?? new Response("Document content is not a PDF", { status: 415 })
  );
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
  // Only the reference of the record read at the caller's scope is opened:
  // bytes shared with another image never answer for this one.
  const response = await createArtifactResponse(deps.entityService, {
    entityType: "image",
    id: imageId,
    entity: image,
    disposition: url.searchParams.has("download") ? "attachment" : "inline",
  });
  return (
    response ?? new Response("Image content is not an image", { status: 415 })
  );
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
    // Access checks read the stored reference; bytes load only for the body.
    getEntity: (ref, visibilityScope) =>
      input.entityService.getEntity({
        ...ref,
        visibilityScope,
      }),
  });

  return access.status === "visible" ? access.entity : undefined;
}
