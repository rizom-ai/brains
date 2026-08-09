import { z } from "@brains/utils/zod";

export const SHA256_DIGEST_PATTERN: RegExp = /^[a-f0-9]{64}$/;
export const ASSET_REF_PATTERN: RegExp = /^asset:\/\/sha256\/([a-f0-9]{64})$/;

export type AssetRef = `asset://sha256/${string}`;

export interface AssetRecord {
  ref: AssetRef;
  digest: string;
  sizeBytes: number;
}

export interface AssetStat {
  ref: AssetRef;
  sizeBytes: number;
}

export interface AssetVerification extends AssetStat {
  expectedDigest: string;
  actualDigest: string;
  valid: boolean;
}

export interface AssetPutStreamOptions {
  /** Exact byte count expected from the stream. */
  expectedSize?: number | undefined;
  /** Maximum accepted byte count. Checked while streaming. */
  maxBytes?: number | undefined;
}

export type BinaryContentMode = "legacy-data-url" | "reference";

export type BinaryContentReadMethod =
  "getEntity" | "getEntityRaw" | "listEntities" | "embedded-reference";

export interface BinaryContentResolutionRequest {
  ref: AssetRef;
  mediaType: string;
  method: BinaryContentReadMethod;
  /** Caller-owned inventory label; never contains entity content. */
  surface?: string | undefined;
}

/** Transitional adapter used only by explicitly inventoried legacy readers. */
export interface BinaryContentResolver {
  materializeLegacyDataUrl(
    request: BinaryContentResolutionRequest,
  ): Promise<string>;
}

export interface AssetStore {
  put(bytes: Uint8Array): Promise<AssetRecord>;
  putStream(
    chunks: AsyncIterable<Uint8Array>,
    options?: AssetPutStreamOptions,
  ): Promise<AssetRecord>;
  /**
   * Read the referenced bytes. Reads are not digest-verified: truncation is
   * caught by a size check, but silent corruption is not, because hashing every
   * read would be prohibitive on read-heavy paths such as site builds. Callers
   * that suspect corruption — or that surface an error to a user — should call
   * `verify` before reporting, so a corrupt asset fails loudly instead of
   * rendering as empty or wrong bytes.
   */
  read(ref: AssetRef): Promise<Uint8Array>;
  stat(ref: AssetRef): Promise<AssetStat | null>;
  verify(ref: AssetRef): Promise<AssetVerification>;
}

export const assetRefSchema: z.ZodType<AssetRef> = z.custom<AssetRef>(
  (value) => typeof value === "string" && ASSET_REF_PATTERN.test(value),
  { message: "Invalid SHA-256 asset reference" },
);

export const binaryContentModeSchema: z.ZodType<BinaryContentMode> = z.enum([
  "legacy-data-url",
  "reference",
]);

export const binaryContentResolutionRequestSchema: z.ZodType<BinaryContentResolutionRequest> =
  z.object({
    ref: assetRefSchema,
    mediaType: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    method: z.enum([
      "getEntity",
      "getEntityRaw",
      "listEntities",
      "embedded-reference",
    ]),
    surface: z.string().trim().min(1).optional(),
  });

export const assetRecordSchema: z.ZodType<AssetRecord> = z
  .object({
    ref: assetRefSchema,
    digest: z.string().regex(SHA256_DIGEST_PATTERN),
    sizeBytes: z.number().int().nonnegative(),
  })
  .refine((record) => getAssetDigest(record.ref) === record.digest, {
    message: "Asset reference and digest must match",
    path: ["digest"],
  });

export function parseAssetRef(value: unknown): AssetRef {
  return assetRefSchema.parse(value);
}

export function createAssetRef(digest: string): AssetRef {
  if (!SHA256_DIGEST_PATTERN.test(digest)) {
    throw new Error("Invalid lowercase SHA-256 digest");
  }
  return parseAssetRef(`asset://sha256/${digest}`);
}

export function getAssetDigest(ref: AssetRef): string {
  const parsed = parseAssetRef(ref);
  return parsed.slice("asset://sha256/".length);
}
