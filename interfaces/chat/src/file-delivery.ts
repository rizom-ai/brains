import { isAbsolute } from "node:path";
import {
  assetRefSchema,
  getAssetDigest,
  MAX_ASSET_BYTES,
} from "@brains/assets";
import {
  canReceiveNativeArtifactFile,
  getArtifactEntityFilename,
  resolveMessageArtifactAccess,
  type ArtifactEntityRef,
  type ICoreEntityService,
  type UserPermissionLevel,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { CHAT_NATIVE_ARTIFACT_MAX_BYTES } from "./artifact-limits";

/** Metadata-only borrowed source. A path is not authorization or a snapshot. */
export interface ArtifactDeliveryFile {
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  filename: string;
}
/** Bind routing and transport capabilities when constructing the adapter.
 * Resolve only after the actual send/share outcome has settled. Receipts must
 * be metadata, not payloads or queued sends. Never automatically replay a send.
 */
export interface FileDeliveryAdapter<TReceipt> {
  deliver(file: ArtifactDeliveryFile, signal: AbortSignal): Promise<TReceipt>;
}
export interface FileDeliveryRequest {
  entityRef: ArtifactEntityRef;
  userLevel: UserPermissionLevel;
  filename?: string | undefined;
  signal?: AbortSignal | undefined;
}
export type FileDeliveryResult<TReceipt> =
  | { status: "delivered"; receipt: TReceipt }
  | {
      status:
        | "denied"
        | "missing"
        | "not-ready"
        | "unsupported"
        | "too-large"
        | "native-disabled";
    };
export type FileDeliveryAssets = Pick<
  ICoreEntityService,
  "getEntity" | "statAsset" | "fileAssets"
>;

/** A known send must not be replayed merely because loan cleanup failed. */
export class AcknowledgedFileDeliveryError<TReceipt> extends Error {
  public readonly receipt: TReceipt;
  constructor(receipt: TReceipt, cause: unknown) {
    super("File delivery acknowledged but loan retirement failed", { cause });
    this.name = "AcknowledgedFileDeliveryError";
    this.receipt = receipt;
  }
}
const statSchema = z.strictObject({
  ref: assetRefSchema,
  sizeBytes: z.number().int().nonnegative().max(MAX_ASSET_BYTES),
});
const fileSchema: z.ZodType<ArtifactDeliveryFile> = z.strictObject({
  sourceFile: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => isAbsolute(path) && !path.includes("\0")),
  sizeBytes: z.number().int().positive().max(CHAT_NATIVE_ARTIFACT_MAX_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ]),
  filename: z
    .string()
    .min(1)
    .max(1024)
    .refine((name) => !/[\0\r\n]/.test(name)),
});
const unavailableStatuses = new Set([
  "pending",
  "generating",
  "failed",
  "error",
]);

/** Shared native-chat policy/lifetime boundary. Uses the existing runtime's
 * admission and retirement; never creates another owner, semaphore or fallback.
 * HTTP response streaming needs a separate consumption interface.
 */
export async function deliverArtifactFile<TReceipt>(
  input: FileDeliveryRequest,
  assets: FileDeliveryAssets,
  adapter: FileDeliveryAdapter<TReceipt>,
): Promise<FileDeliveryResult<TReceipt>> {
  const request = { ...input, entityRef: { ...input.entityRef } };
  request.signal?.throwIfAborted();
  const access = await resolveMessageArtifactAccess({
    entityRef: request.entityRef,
    userLevel: request.userLevel,
    getEntity: (ref) => assets.getEntity(ref),
    getVisibleEntity: (ref, visibilityScope) =>
      assets.getEntity({ ...ref, visibilityScope }),
  });
  request.signal?.throwIfAborted();
  if (access.status !== "visible") return { status: access.status };
  if (!canReceiveNativeArtifactFile(request.userLevel))
    return { status: "native-disabled" };
  const entity = access.entity;
  if (unavailableStatuses.has(String(entity.metadata["status"])))
    return { status: "not-ready" };
  const ref = assetRefSchema.safeParse(entity.content.trim());
  const mimeType =
    entity.metadata[
      request.entityRef.entityType === "document" ? "mimeType" : "mediaType"
    ];
  if (
    !ref.success ||
    typeof mimeType !== "string" ||
    (request.entityRef.entityType === "document"
      ? mimeType !== "application/pdf"
      : !/^image\/(png|jpeg|gif|webp)$/.test(mimeType))
  )
    return { status: "unsupported" };
  const reader = assets.fileAssets;
  if (!reader) throw new Error("Artifact file delivery is not provisioned");
  const filename =
    request.filename ??
    getArtifactEntityFilename(
      entity.metadata,
      request.entityRef.id,
      request.entityRef.entityType,
      mimeType,
    );
  const rawStat = await assets.statAsset(ref.data);
  request.signal?.throwIfAborted();
  if (!rawStat) return { status: "missing" };
  const stat = statSchema.parse(rawStat);
  if (stat.ref !== ref.data)
    throw new Error("Artifact stat does not match its reference");
  if (stat.sizeBytes > CHAT_NATIVE_ARTIFACT_MAX_BYTES)
    return { status: "too-large" };
  let acknowledgement: { receipt: TReceipt } | undefined;
  let delivered: FileDeliveryResult<TReceipt> | undefined;
  let open = true;
  let entered = false;
  try {
    const result = await reader.withAssetFile(
      ref.data,
      async (source, signal): Promise<FileDeliveryResult<TReceipt>> => {
        if (!open || entered)
          throw new Error(
            "Artifact file consumer is closed or already entered",
          );
        entered = true;
        signal.throwIfAborted();
        const file = fileSchema.parse({ ...source, mimeType, filename });
        if (
          file.sizeBytes !== stat.sizeBytes ||
          file.sha256 !== getAssetDigest(ref.data)
        )
          throw new Error(
            "Artifact loan does not match its reference and stat",
          );
        const receipt = await adapter.deliver(file, signal);
        acknowledgement = { receipt };
        delivered = { status: "delivered", receipt };
        return delivered;
      },
      request.signal ? { signal: request.signal } : undefined,
    );
    if (!delivered || result !== delivered)
      throw new Error("Artifact loan did not return the adapter outcome");
    return delivered;
  } catch (error) {
    if (acknowledgement)
      throw new AcknowledgedFileDeliveryError(acknowledgement.receipt, error);
    throw error;
  } finally {
    open = false;
  }
}
