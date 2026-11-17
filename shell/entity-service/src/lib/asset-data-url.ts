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
  // Images record a `mediaType`, documents a `mimeType`.
  const recorded = metadata["mediaType"] ?? metadata["mimeType"];
  const mediaType =
    typeof recorded === "string" ? recorded : "application/octet-stream";
  return `data:${mediaType};base64,${bytes.toString("base64")}`;
}
