import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";

export const SHA256_DIGEST_PATTERN: RegExp = /^[a-f0-9]{64}$/;
export const ASSET_REF_PATTERN: RegExp = /^asset:\/\/sha256\/([a-f0-9]{64})$/;
export const ASSET_REF_PREFIX = "asset://sha256/" as const;

/** Largest payload proven by the Bun/libSQL benchmark. Deployments may lower it. */
export const MAX_ASSET_BYTES: number = 100 * 1024 * 1024;

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

/**
 * Validated, bounded bytes ready to join an entity mutation. Preparation does
 * not write durable state; only the entity transaction may commit the bytes.
 */
export interface PreparedAsset extends AssetRecord {
  bytes: Uint8Array;
}

export interface PrepareAssetOptions {
  /** Exact byte count expected by the caller. */
  expectedSize?: number | undefined;
  /** Maximum accepted bytes. Defaults to the benchmark-proven ceiling. */
  maxBytes?: number | undefined;
}

/** Read-only durable asset surface. There is deliberately no independent put. */
export interface AssetReader {
  read(ref: AssetRef): Promise<Uint8Array>;
  stat(ref: AssetRef): Promise<AssetStat | null>;
  verify(ref: AssetRef): Promise<AssetVerification>;
}

export const assetRefSchema: z.ZodType<AssetRef> = z.custom<AssetRef>(
  (value) => typeof value === "string" && ASSET_REF_PATTERN.test(value),
  { message: "Invalid SHA-256 asset reference" },
);

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
  return parseAssetRef(`${ASSET_REF_PREFIX}${digest}`);
}

export function getAssetDigest(ref: AssetRef): string {
  return parseAssetRef(ref).slice(ASSET_REF_PREFIX.length);
}

export function computeAssetDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function prepareAsset(
  input: Uint8Array,
  options: PrepareAssetOptions = {},
): PreparedAsset {
  const maxBytes = options.maxBytes ?? MAX_ASSET_BYTES;
  assertByteLimit("maxBytes", maxBytes, false);
  if (options.expectedSize !== undefined) {
    assertByteLimit("expectedSize", options.expectedSize, true);
    if (input.byteLength !== options.expectedSize) {
      throw new Error(
        `Asset size mismatch: expected ${options.expectedSize} bytes, received ${input.byteLength}`,
      );
    }
  }
  if (input.byteLength > maxBytes) {
    throw new Error(
      `Asset exceeds ${maxBytes}-byte limit: received ${input.byteLength} bytes`,
    );
  }

  // Own a stable copy so preparation is not invalidated by caller mutation.
  const bytes = Uint8Array.from(input);
  const digest = computeAssetDigest(bytes);
  return {
    ref: createAssetRef(digest),
    digest,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

export function assertPreparedAsset(asset: PreparedAsset): void {
  assetRecordSchema.parse(asset);
  if (!(asset.bytes instanceof Uint8Array)) {
    throw new Error("Prepared asset bytes must be a Uint8Array");
  }
  if (asset.bytes.byteLength !== asset.sizeBytes) {
    throw new Error(
      `Prepared asset size mismatch: declared ${asset.sizeBytes} bytes, received ${asset.bytes.byteLength}`,
    );
  }
  const actualDigest = computeAssetDigest(asset.bytes);
  if (actualDigest !== asset.digest) {
    throw new Error(
      `Prepared asset digest mismatch: expected ${asset.digest}, received ${actualDigest}`,
    );
  }
}

function assertByteLimit(
  name: "expectedSize" | "maxBytes",
  value: number,
  allowZero: boolean,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new Error(
      `${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
    );
  }
}
