import { base64AssetSource, computeAssetDigest } from "@brains/entity-service";
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
  const match = INLINE_DATA_URL.exec(content.trim());
  if (!match?.[1] || match[2] === undefined) {
    return { status: "blocked", reason: "malformed" };
  }
  if (match[1].toLowerCase().startsWith("svg")) {
    return { status: "blocked", reason: "svg" };
  }
  const payload = match[2].replace(/\s/g, "");
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
