import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";

export const SHA256_DIGEST_PATTERN: RegExp = /^[a-f0-9]{64}$/;
export const ASSET_REF_PATTERN: RegExp = /^asset:\/\/sha256\/([a-f0-9]{64})$/;
export const ASSET_REF_PREFIX = "asset://sha256/" as const;

/** Contract ceiling for one asset. Entity types and deployments may lower it. */
export const MAX_ASSET_BYTES: number = 100 * 1024 * 1024;

/** Assets are stored as chunk rows of exactly this size, except the last. */
export const ASSET_CHUNK_BYTES: number = 1024 * 1024;

/** A multiple of four base64 characters that decodes to just under one chunk. */
const BASE64_SLICE_CHARS = 1_398_100;
const BASE64_BODY_PATTERN = /^[A-Za-z0-9+/]*$/;
const BASE64_TAIL_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export type AssetRef = `asset://sha256/${string}`;

/** Bytes to stage: one buffer, or a stream of pieces of any size. */
export type AssetSource =
  Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;

export interface AssetStat {
  ref: AssetRef;
  sizeBytes: number;
}

export interface AssetVerification extends AssetStat {
  expectedDigest: string;
  actualDigest: string;
  valid: boolean;
}

export interface StageAssetOptions {
  /** Exact byte count expected by the caller. */
  expectedSize?: number | undefined;
  /** Maximum accepted bytes; never raises the repository ceiling. */
  maxBytes?: number | undefined;
}

export interface AssetStageLimits {
  maxBytes: number;
  expectedSize?: number;
}

/** Read-only durable asset surface. There is deliberately no independent put. */
export interface AssetReader {
  /** Chunks in order; resolves only after the asset is known to exist. */
  openRead(ref: AssetRef): Promise<AsyncIterable<Uint8Array>>;
  read(ref: AssetRef): Promise<Uint8Array>;
  stat(ref: AssetRef): Promise<AssetStat | null>;
  verify(ref: AssetRef): Promise<AssetVerification>;
}

/** The asset surface needed to stream an asset's stored chunks. */
export interface AssetOpener {
  openAsset(ref: AssetRef): Promise<AsyncIterable<Uint8Array>>;
}

/** An asset's full bytes, read explicitly from its stored chunks. */
export async function readAssetBytes(
  opener: AssetOpener,
  ref: AssetRef,
): Promise<Buffer<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of await opener.openAsset(ref)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export const assetRefSchema: z.ZodCustom<AssetRef, AssetRef> =
  z.custom<AssetRef>(
    (value) => typeof value === "string" && ASSET_REF_PATTERN.test(value),
    { message: "Invalid SHA-256 asset reference" },
  );

export const assetRecordSchema: z.ZodObject<{
  ref: typeof assetRefSchema;
  digest: z.ZodString;
  sizeBytes: z.ZodNumber;
}> = z
  .object({
    ref: assetRefSchema,
    digest: z.string().regex(SHA256_DIGEST_PATTERN),
    sizeBytes: z.number().int().nonnegative(),
  })
  .refine((record) => getAssetDigest(record.ref) === record.digest, {
    message: "Asset reference and digest must match",
    path: ["digest"],
  });

export type AssetRecord = z.output<typeof assetRecordSchema>;

/**
 * Durable but unpublished bytes. Only the repository that staged a handle can
 * publish it, once, together with an entity reference.
 */
export type StagedAsset = Readonly<AssetRecord>;

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

/** Resolve caller limits against a ceiling before any bytes are read. */
export function resolveAssetStageLimits(
  options: StageAssetOptions,
  ceiling: number,
): AssetStageLimits {
  assertByteCount("maxBytes", ceiling, false);
  if (options.maxBytes !== undefined) {
    assertByteCount("maxBytes", options.maxBytes, false);
  }
  const maxBytes = Math.min(options.maxBytes ?? ceiling, ceiling);
  if (options.expectedSize === undefined) return { maxBytes };
  assertByteCount("expectedSize", options.expectedSize, true);
  if (options.expectedSize > maxBytes) {
    throw new Error(
      `Asset exceeds ${maxBytes}-byte limit: expected ${options.expectedSize} bytes`,
    );
  }
  return { maxBytes, expectedSize: options.expectedSize };
}

/**
 * Re-chunk a source into pieces of exactly `chunkBytes`, except the last.
 * Chunks may be views of the source's buffers; consumers own any copies.
 */
export async function* chunkAssetSource(
  source: AssetSource,
  chunkBytes: number = ASSET_CHUNK_BYTES,
): AsyncGenerator<Uint8Array, void, undefined> {
  assertByteCount("chunkBytes", chunkBytes, false);
  const pieces = source instanceof Uint8Array ? [source] : source;
  let carry: Uint8Array = new Uint8Array(0);
  for await (const piece of pieces) {
    const combined =
      carry.byteLength === 0 ? piece : Buffer.concat([carry, piece]);
    const whole = Math.floor(combined.byteLength / chunkBytes);
    yield* Array.from({ length: whole }, (_, index) =>
      combined.subarray(index * chunkBytes, (index + 1) * chunkBytes),
    );
    carry = combined.subarray(whole * chunkBytes);
  }
  if (carry.byteLength > 0) yield carry;
}

/**
 * Decode base64 lazily in slices so a large payload never decodes in one
 * synchronous call. Malformed input fails instead of losing characters.
 */
export function base64AssetSource(
  base64: string,
  sliceChars: number = BASE64_SLICE_CHARS,
): Iterable<Uint8Array> {
  if (
    !Number.isSafeInteger(sliceChars) ||
    sliceChars <= 0 ||
    sliceChars % 4 !== 0
  ) {
    throw new Error("sliceChars must be a positive multiple of 4");
  }
  return decodeBase64Slices(base64, sliceChars, 0);
}

function* decodeBase64Slices(
  base64: string,
  sliceChars: number,
  offset: number,
): Generator<Uint8Array, void, undefined> {
  if (offset >= base64.length) return;
  const slice = base64.slice(offset, offset + sliceChars);
  const last = offset + sliceChars >= base64.length;
  const pattern = last ? BASE64_TAIL_PATTERN : BASE64_BODY_PATTERN;
  if (slice.length % 4 !== 0 || !pattern.test(slice)) {
    throw new Error("Invalid base64 asset payload");
  }
  yield Buffer.from(slice, "base64");
  yield* decodeBase64Slices(base64, sliceChars, offset + sliceChars);
}

function assertByteCount(
  name: "chunkBytes" | "expectedSize" | "maxBytes",
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
