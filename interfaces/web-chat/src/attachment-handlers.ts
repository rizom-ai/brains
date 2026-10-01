import {
  createArtifactResponse,
  resolveMessageArtifactAccess,
  type InterfacePluginContext,
  type StoredArtifact,
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

const ARTIFACT_LABELS: Record<
  ArtifactEntityType,
  { noun: string; title: string; unsupported: string }
> = {
  document: {
    noun: "document",
    title: "Document",
    unsupported: "Document content is not a PDF",
  },
  image: {
    noun: "image",
    title: "Image",
    unsupported: "Image content is not an image",
  },
};

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
  entityType: ArtifactEntityType,
  request: Request,
  deps: AttachmentHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel === "public") {
    return deps.createAuthLoginRequiredResponse(request);
  }

  const labels = ARTIFACT_LABELS[entityType];
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return new Response(`Missing ${labels.noun} id`, { status: 400 });
  }

  const entity = await resolveVisibleArtifactEntity({
    entityType,
    id,
    permissionLevel,
    entityService: deps.entityService,
  });
  if (!entity) {
    return new Response(`${labels.title} not found`, { status: 404 });
  }

  const response = await createArtifactResponse(deps.entityService, {
    entityType,
    id,
    entity,
    disposition: url.searchParams.has("download") ? "attachment" : "inline",
  });
  return response ?? new Response(labels.unsupported, { status: 415 });
}

async function resolveVisibleArtifactEntity(input: {
  entityType: ArtifactEntityType;
  id: string;
  permissionLevel: UserPermissionLevel;
  entityService: EntityService;
}): Promise<StoredArtifact | undefined> {
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
