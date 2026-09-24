import { mapMarkdownImageUrls } from "@brains/image";
import { withPublishEntityFile, type BaseEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { AtprotoBlobEvidenceError } from "@brains/atproto-contracts";
import type {
  AtprotoBlobRef,
  AtprotoBrainPostRecord,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";

type BodyImage = NonNullable<AtprotoBrainPostRecord["images"]>[number];
export interface AtprotoBodyImageReceipt {
  imageId: string;
  sha256: string;
  blob: AtprotoBlobRef;
  url?: string;
}
export class AcknowledgedAtprotoPostImagesError extends AtprotoBlobEvidenceError {
  public readonly receipts: readonly AtprotoBodyImageReceipt[];
  constructor(receipts: readonly AtprotoBodyImageReceipt[], cause: unknown) {
    super(
      "AT Protocol body images uploaded but post preparation failed",
      "body-images",
      receipts,
      { cause },
    );
    this.name = "AcknowledgedAtprotoPostImagesError";
    this.receipts = receipts.map((receipt) => ({ ...receipt }));
  }
}

const publicUrlSchema = z
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      Buffer.byteLength(value, "utf8") <= 4096
    );
  });
function imageId(url: string): string | undefined {
  if (/^data:/i.test(url))
    throw new Error("Inline AT Protocol body images require asset references");
  if (!/^entity:/i.test(url)) return undefined;
  const match = /^entity:\/\/image\/([^/?#]+)$/i.exec(url);
  if (!match?.[1]) throw new Error("Invalid AT Protocol body image reference");
  return z.string().min(1).max(256).parse(decodeURIComponent(match[1]));
}
function assertBodySize(body: string): void {
  if (Buffer.byteLength(body, "utf8") > 100_000)
    throw new Error("AT Protocol post body exceeds its size limit");
}

/** Sequential native uploads, one source loan at a time. Receipts survive
 * later failures; an acknowledged prefix never authorizes replay or a record. */
export async function prepareAtprotoBodyImages(
  body: string,
  {
    context,
    client,
    dryRun = false,
  }: Pick<AtprotoProjectionBuildInput, "context" | "client" | "dryRun">,
): Promise<{
  body: string;
  images: BodyImage[];
  receipts: AtprotoBodyImageReceipt[];
}> {
  assertBodySize(body);
  const ids = new Set<string>();
  let occurrences = 0;
  mapMarkdownImageUrls(body, (url) => {
    const id = imageId(url);
    if (id !== undefined) {
      ids.add(id);
      if (++occurrences > 32 || ids.size > 8)
        throw new Error(
          "AT Protocol posts support at most eight body image assets and 32 occurrences",
        );
    }
    return url;
  });
  if (ids.size === 0) return { body, images: [], receipts: [] };
  if (!dryRun && (!client?.uploadBlob || !client.getBlobUrl))
    throw new Error(
      "AT Protocol body images require blob upload and public URL capabilities",
    );
  // Authorize the whole set before the first external side effect.
  const sources = new Map<string, BaseEntity>();
  for (const id of ids) {
    const entity = await context.entityService.getEntity({
      entityType: "image",
      id,
    });
    if (!entity) throw new Error(`AT Protocol body image is missing: ${id}`);
    if (entity.visibility !== "public")
      throw new Error(`Cannot publish non-public body image: ${id}`);
    sources.set(id, entity);
  }
  const images: BodyImage[] = [];
  const receipts: AtprotoBodyImageReceipt[] = [];
  const urls = new Map<string, string>();
  let lastSignal: AbortSignal | undefined;
  try {
    for (const [id, entity] of sources) {
      lastSignal?.throwIfAborted();
      const result = await withPublishEntityFile(
        context.entityService,
        entity,
        "image",
        async (file) => {
          lastSignal = file.signal;
          file.signal.throwIfAborted();
          const blob = dryRun
            ? {
                $type: "blob" as const,
                ref: { $link: "dry-run" },
                mimeType: file.mimeType,
                size: file.sizeBytes,
              }
            : (await client?.uploadBlob?.(file))?.blob;
          if (!blob)
            throw new Error("AT Protocol blob upload returned no receipt");
          const receipt: AtprotoBodyImageReceipt = {
            imageId: id,
            sha256: file.sha256,
            blob,
          };
          if (!dryRun) receipts.push(receipt);
          file.signal.throwIfAborted();
          const url = publicUrlSchema.parse(
            dryRun
              ? `https://dry-run.invalid/images/${encodeURIComponent(id)}`
              : await client?.getBlobUrl?.(blob, file.signal),
          );
          receipt.url = url;
          file.signal.throwIfAborted();
          return { blob, url };
        },
      );
      lastSignal?.throwIfAborted();
      images.push(result);
      urls.set(id, result.url);
    }
    const rewritten = mapMarkdownImageUrls(body, (url) => {
      const id = imageId(url);
      return id === undefined ? url : (urls.get(id) ?? url);
    });
    assertBodySize(rewritten);
    return { body: rewritten, images, receipts };
  } catch (error) {
    if (receipts.length)
      throw new AcknowledgedAtprotoPostImagesError(receipts, error);
    throw error;
  }
}
