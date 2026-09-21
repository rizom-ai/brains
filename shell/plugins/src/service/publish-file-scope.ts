import {
  assetRefSchema,
  getAssetDigest,
  MAX_ASSET_BYTES,
} from "@brains/assets";
import type {
  BaseEntity,
  EntityServiceClient,
  EntityFileAssets,
  EntityBinaryRequestOptions,
} from "@brains/entity-service";
import type { PublishImageData, PublishMediaData } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { AttachmentFile } from "./attachment-file";

const sizeSchema = z.number().int().positive().max(MAX_ASSET_BYTES);
const imageMimeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const pdfDetailsSchema = z.object({
  mimeType: z.literal("application/pdf"),
  pageCount: z.number().int().nonnegative(),
});

/** Authorization belongs to the caller. Metadata is not inspection authority;
 * inspect the owned file and compare every binary receipt before publishing.
 */
export async function withPublishEntityFile<T>(
  service: Pick<EntityServiceClient, "fileAssets" | "statAsset">,
  entity: BaseEntity,
  kind: "image" | "document",
  use: (file: PublishImageData) => Promise<T>,
  options?: EntityBinaryRequestOptions,
): Promise<T> {
  options?.signal?.throwIfAborted();
  if (entity.entityType !== kind)
    throw new Error("Publishing entity type mismatch");
  if (
    entity.metadata["status"] === "pending" ||
    entity.metadata["status"] === "failed"
  )
    throw new Error("Publishing artifact is not ready");
  const ref = assetRefSchema.parse(entity.content);
  const sizeBytes = sizeSchema.parse(entity.metadata["sizeBytes"]);
  const mimeType =
    kind === "document"
      ? z.literal("application/pdf").parse(entity.metadata["mimeType"])
      : imageMimeSchema.parse(entity.metadata["mediaType"]);
  const record = await service.statAsset(ref);
  if (!record) throw new Error("Publishing asset not found");
  const stat = z
    .strictObject({ ref: assetRefSchema, sizeBytes: sizeSchema })
    .parse(record);
  if (stat.ref !== ref || stat.sizeBytes !== sizeBytes)
    throw new Error("Publishing asset metadata does not match its record");
  const files = service.fileAssets;
  if (!files) throw new Error("Publishing file access is not provisioned");
  return files.withAssetFile(
    ref,
    async (file, signal) => {
      signal.throwIfAborted();
      if (
        file.sizeBytes !== stat.sizeBytes ||
        file.sha256 !== getAssetDigest(stat.ref)
      )
        throw new Error("Publishing asset loan does not match its record");
      const inspection = await files.inspect(
        { sourceFile: file.sourceFile, sizeBytes: file.sizeBytes },
        { ...(kind === "document" && { inspector: "pdf" }), signal },
      );
      signal.throwIfAborted();
      if (
        inspection.sha256 !== file.sha256 ||
        inspection.sizeBytes !== file.sizeBytes
      )
        throw new Error("Publishing file changed after acquisition");
      if (kind === "document") {
        const details = pdfDetailsSchema.parse(inspection.details);
        if (details.pageCount !== entity.metadata["pageCount"])
          throw new Error(
            "Publishing document page count does not match inspection",
          );
      } else if (
        z.object({ mediaType: imageMimeSchema }).parse(inspection.details)
          .mediaType !== mimeType
      ) {
        throw new Error(
          "Publishing image media type does not match inspection",
        );
      }
      return use({ ...file, mimeType, signal });
    },
    options,
  );
}

export async function publishAttachmentFile(
  files: Pick<EntityFileAssets, "inspect"> | undefined,
  attachment: AttachmentFile,
  signal: AbortSignal,
): Promise<PublishMediaData> {
  signal.throwIfAborted();
  if (!files) throw new Error("Attachment file inspection is not provisioned");
  const inspected = await files.inspect(attachment.source, {
    ...(attachment.type === "document" && { inspector: "pdf" }),
    signal,
  });
  signal.throwIfAborted();
  if (
    inspected.sha256 !== attachment.sha256 ||
    inspected.sizeBytes !== attachment.source.sizeBytes
  )
    throw new Error("Publishing attachment does not match inspection");
  const declaredMime =
    attachment.type === "document"
      ? pdfDetailsSchema.parse(inspected.details).mimeType
      : z.object({ mediaType: z.literal("image/png") }).parse(inspected.details)
          .mediaType;
  if (declaredMime !== attachment.mimeType)
    throw new Error(
      "Publishing attachment media type does not match inspection",
    );
  const descriptor = {
    ...attachment.source,
    sha256: attachment.sha256,
    filename: attachment.filename,
    signal,
  };
  return attachment.type === "document"
    ? { ...descriptor, type: "document", mimeType: "application/pdf" }
    : { ...descriptor, type: "image", mimeType: "image/png" };
}
