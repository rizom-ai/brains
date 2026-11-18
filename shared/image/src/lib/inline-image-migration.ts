import { base64AssetSource, computeAssetDigest } from "@brains/entity-service";
import { markdownBody } from "@brains/utils/markdown-frontmatter";
import { IMAGE_ASSET_MAX_BYTES } from "./stage-image";
import { describeImageBytes, type ImageByteDescription } from "./image-utils";

/** Why an inline image cannot become an asset as it is. */
export type InlineImageBlocker =
  "svg" | "malformed" | "double-encoded" | "unsupported" | "oversized";

/** What migrating one inline image to an asset would store. */
export type InlineImageVerdict =
  | ({
      status: "ready";
      digest: string;
      sizeBytes: number;
    } & ImageByteDescription)
  | { status: "blocked"; reason: Exclude<InlineImageBlocker, "oversized"> }
  | { status: "blocked"; reason: "oversized"; sizeBytes: number };

/**
 * What pending images stored before they stopped carrying a 1x1 placeholder.
 * A pending or failed row holding exactly this has no real bytes.
 */
export const LEGACY_PENDING_IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** The SHA-256 of that placeholder's bytes, as an asset names them. */
const LEGACY_PENDING_IMAGE_PLACEHOLDER_DIGEST =
  "6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0";

/**
 * Whether bytes, by their asset digest, are the old 1x1 placeholder of an
 * image still awaiting its bytes, which nothing that reads files back may
 * store as that image's. A complete image may be any 1x1 PNG, this one too.
 */
export function isLegacyPendingImageBytes(
  digest: string,
  status: string | undefined,
): boolean {
  return (
    (status === "pending" || status === "failed") &&
    digest === LEGACY_PENDING_IMAGE_PLACEHOLDER_DIGEST
  );
}

/** Payloads may be wrapped or padded with whitespace, as files were. */
const INLINE_DATA_URL = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]*)$/i;

/**
 * Decoding a whole data URL as base64 drops its ":", ";" and "," and stores
 * this prefix; the stripped characters cannot be recovered from the row.
 */
const DOUBLE_ENCODED_PAYLOAD = /^dataimage\/[a-z0-9]+base64/i;

/**
 * Decode an inline image and say whether it can become an asset.
 * The bytes decide the format; SVG, malformed, unsupported and oversized
 * images are blocked rather than converted.
 */
export function classifyInlineImage(
  content: string,
  maxBytes: number = IMAGE_ASSET_MAX_BYTES,
): InlineImageVerdict {
  const parsed = parseInlineImage(content);
  if (!parsed) return { status: "blocked", reason: "malformed" };
  if (parsed.subtype.startsWith("svg")) {
    return { status: "blocked", reason: "svg" };
  }
  const { payload } = parsed;
  if (DOUBLE_ENCODED_PAYLOAD.test(payload)) {
    return { status: "blocked", reason: "double-encoded" };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.concat([...base64AssetSource(payload)]);
  } catch {
    return { status: "blocked", reason: "malformed" };
  }
  if (bytes.byteLength === 0) {
    return { status: "blocked", reason: "malformed" };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      status: "blocked",
      reason: "oversized",
      sizeBytes: bytes.byteLength,
    };
  }
  const described = describeImageBytes(bytes);
  if (!described) return { status: "blocked", reason: "unsupported" };
  return {
    status: "ready",
    digest: computeAssetDigest(bytes),
    sizeBytes: bytes.byteLength,
    ...described,
  };
}

/** An inline image's base64 payload without whitespace, if it is a data URL. */
export function inlineImagePayload(content: string): string | undefined {
  return parseInlineImage(content)?.payload;
}

function parseInlineImage(
  content: string,
): { subtype: string; payload: string } | undefined {
  // Non-public rows store a visibility header before the data URL.
  const match = INLINE_DATA_URL.exec(markdownBody(content, { trim: true }));
  if (!match?.[1] || match[2] === undefined) return undefined;
  return {
    subtype: match[1].toLowerCase(),
    payload: match[2].replace(/\s/g, ""),
  };
}
