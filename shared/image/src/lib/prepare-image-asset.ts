import { prepareAsset, type PreparedAsset } from "@brains/assets";
import { inspectImageBytes } from "./image-utils";
import {
  imageAssetFactsSchema,
  type ImageAssetFacts,
} from "../schemas/image-asset-facts";

export interface PreparedImageAsset {
  asset: PreparedAsset;
  facts: ImageAssetFacts;
}

/** Producer-side helper for existing buffered ingestion. Hash/copy once, inspect
 * the same owned backing, and give the image constructor only metadata.
 * This is not the streamed native producer or a controller-side fallback for it.
 */
export function prepareImageAsset(
  bytes: Uint8Array,
  declaredMediaType?: string,
): PreparedImageAsset {
  const asset = prepareAsset(bytes);
  const inspected = inspectImageBytes(asset.bytes, declaredMediaType);
  const facts = imageAssetFactsSchema.parse({
    ref: asset.ref,
    digest: asset.digest,
    ...inspected,
  });
  return { asset, facts };
}
