import {
  assetRefSchema,
  readAssetBytes,
  type AssetOpener,
} from "@brains/assets";

/**
 * The data URL inline storage held for this content: an asset reference is
 * encoded from its stored bytes, any other content is returned unchanged.
 */
export async function inlineAssetContent(
  opener: AssetOpener,
  content: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const ref = assetRefSchema.safeParse(content);
  if (!ref.success) return content;
  const bytes = await readAssetBytes(opener, ref.data);
  const mediaType =
    typeof metadata["mediaType"] === "string"
      ? metadata["mediaType"]
      : "application/octet-stream";
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}
