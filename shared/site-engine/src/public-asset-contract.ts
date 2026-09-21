import { z } from "@brains/utils/zod";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { fileProducePathSchema } from "@brains/db/file-produce";

export const MAX_PUBLIC_ASSET_SNAPSHOT_BYTES: number = 64 * 1024 * 1024;
export const PUBLIC_ASSET_MANIFEST_BYTES: number = 64 * 1024;
export const MAX_PUBLIC_ASSET_FILES: number = 512;
export const publicAssetPathSchema: z.ZodString = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) =>
      !["__proto__", "prototype", "constructor"].includes(value) &&
      [...value].every(
        (character) =>
          character !== "\\" &&
          character.charCodeAt(0) >= 32 &&
          character.charCodeAt(0) !== 127,
      ) &&
      value
        .split("/")
        .every((part) => part !== "" && part !== "." && part !== ".."),
  );
export interface PublicAssetFacts {
  sizeBytes: number;
  sha256: string;
}
export type PublicAssetMap = Record<string, PublicAssetFacts>;
export const publicAssetFactsSchema: z.ZodType<PublicAssetFacts> =
  z.strictObject({
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_PUBLIC_ASSET_SNAPSHOT_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  });
export const publicAssetMapSchema: z.ZodType<PublicAssetMap> = z
  .record(publicAssetPathSchema, publicAssetFactsSchema)
  .refine(
    (files) =>
      Object.keys(files).length <= MAX_PUBLIC_ASSET_FILES &&
      Object.values(files).reduce((sum, file) => sum + file.sizeBytes, 0) <=
        MAX_PUBLIC_ASSET_SNAPSHOT_BYTES,
  );
export interface PublicAssetManifest {
  version: 1;
  files: PublicAssetMap;
}
export const publicAssetManifestSchema: z.ZodType<PublicAssetManifest> =
  z.strictObject({ version: z.literal(1), files: publicAssetMapSchema });
export interface PublicAssetCopyReceipt {
  sourceSha256: string;
  files: number;
  sizeBytes: number;
}
export const publicAssetCopyReceiptSchema: z.ZodType<PublicAssetCopyReceipt> =
  z.strictObject({
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.number().int().nonnegative().max(MAX_PUBLIC_ASSET_FILES),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_PUBLIC_ASSET_SNAPSHOT_BYTES),
  });
export type PublicAssetRequest =
  | { mode: "snapshot"; maxTotalBytes: number }
  | { mode: "fingerprint"; sourceFile: string; sizeBytes: number }
  | {
      mode: "copy";
      snapshotFile: string;
      snapshotSizeBytes: number;
      snapshotSha256: string;
    };
export const publicAssetRequestSchema: z.ZodType<PublicAssetRequest> =
  z.discriminatedUnion("mode", [
    z.strictObject({
      mode: z.literal("fingerprint"),
      sourceFile: fileProducePathSchema,
      sizeBytes: z.coerce.number().int().nonnegative().max(MAX_ASSET_BYTES),
    }),
    z.strictObject({
      mode: z.literal("snapshot"),
      maxTotalBytes: z.coerce
        .number()
        .int()
        .nonnegative()
        .max(MAX_PUBLIC_ASSET_SNAPSHOT_BYTES),
    }),
    z.strictObject({
      mode: z.literal("copy"),
      snapshotFile: fileProducePathSchema,
      snapshotSizeBytes: z.coerce
        .number()
        .int()
        .positive()
        .max(PUBLIC_ASSET_MANIFEST_BYTES),
      snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ]);
