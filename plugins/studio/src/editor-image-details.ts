import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  recordStudioMutationAudit,
  requireEntityAction,
  studioMutationOptions,
} from "./editor-access";
import type {
  EditorRouteOptions,
  StudioRequestAccess,
} from "./editor-contracts";
import { jsonResponse } from "./editor-response";
import { editorValidationResponse } from "./editor-validation";
import type { StudioContext } from "./studio-context";

const detailsQuerySchema = z.object({ id: z.string().min(1) });

const detailsPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim(),
  alt: z.string().trim(),
  /** Content hash the edit was based on; stale writes are rejected. */
  baseContentHash: z.string().optional(),
});

const storedMetadataSchema = z.looseObject({
  title: z.string().optional(),
  alt: z.string().optional(),
  altSource: z.enum(["fallback", "generated", "owner"]).optional(),
});

async function readImage(
  context: StudioContext,
  id: string,
  access: StudioRequestAccess,
): Promise<BaseEntity | null> {
  if (!context.entityService.getEntityTypes().includes("image")) return null;
  // As stored: the bytes stay an asset reference and are never loaded.
  return context.entityService.getEntityRaw({
    entityType: "image",
    id,
    visibilityScope: access.visibilityScope,
    source: true,
  });
}

/** An image's title and alt text, who wrote the alt text, and its version. */
export async function handleGetImageDetails(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const query = detailsQuerySchema.safeParse({
    id: new URL(request.url).searchParams.get("id"),
  });
  if (!query.success)
    return jsonResponse({ error: "Image id is required" }, 400);
  const image = await readImage(context, query.data.id, access);
  if (!image) return jsonResponse({ error: "Image unavailable" }, 404);
  const metadata = storedMetadataSchema.parse(image.metadata);
  return jsonResponse({
    id: image.id,
    title: metadata.title ?? "",
    alt: metadata.alt ?? "",
    altSource: metadata.altSource ?? "fallback",
    contentHash: image.contentHash,
  });
}

/**
 * Save an image's title and alt text. The alt text becomes the owner's, so
 * the brain's vision model never replaces it; the bytes are left as stored.
 */
export async function handleUpdateImageDetails(
  context: StudioContext,
  request: Request,
  access: StudioRequestAccess,
  recordAuditEvent: EditorRouteOptions["recordAuditEvent"],
): Promise<Response> {
  const payload = detailsPayloadSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!payload.success)
    return jsonResponse({ error: "Invalid image details" }, 400);
  const { id, title, alt, baseContentHash } = payload.data;
  const existing = await readImage(context, id, access);
  if (!existing) return jsonResponse({ error: "Image unavailable" }, 404);
  if (
    baseContentHash !== undefined &&
    baseContentHash !== existing.contentHash
  ) {
    return jsonResponse(
      {
        error:
          "This image changed since it was opened. Reload to review before saving again.",
        currentContentHash: existing.contentHash,
      },
      409,
    );
  }
  const denied = requireEntityAction(context, "image", "update", access);
  if (denied) {
    await recordStudioMutationAudit(
      recordAuditEvent,
      access,
      "update",
      "denied",
      "image",
      id,
      "entity-action-policy",
    );
    return denied;
  }

  let result;
  try {
    result = await context.entityService.updateEntity({
      entity: {
        ...existing,
        metadata: { ...existing.metadata, title, alt, altSource: "owner" },
      },
      options: studioMutationOptions(access),
    });
  } catch (error) {
    const invalid = editorValidationResponse(error);
    if (invalid) return invalid;
    throw error;
  }
  await recordStudioMutationAudit(
    recordAuditEvent,
    access,
    "update",
    "allowed",
    "image",
    id,
  );
  return jsonResponse({ entityId: result.entityId, skipped: result.skipped });
}
