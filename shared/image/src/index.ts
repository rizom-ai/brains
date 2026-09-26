// Image entity schemas and types
export {
  imageSchema,
  imageMetadataSchema,
  imageFormatSchema,
  imageIngestionStatusSchema,
  resolvedImageSchema,
  type Image,
  type ImageMetadata,
  type ImageFormat,
  type ImageIngestionStatus,
  type ResolvedImage,
} from "./schemas/image";

// Deriving an image's own metadata from its bytes. Named consumers:
// @brains/image-plugin, @brains/stock-photo.
export { imageMetadataFor, imageDataUrl } from "./lib/image-metadata";

// Image resolver utilities
export {
  resolveImage,
  resolveEntityCoverImage,
  extractCoverImageId,
  setCoverImageId,
  extractOgImageId,
  setOgImageId,
  type ImageEntityReader,
} from "./lib/image-resolver";

// Markdown image utilities
export { extractMarkdownImages } from "./lib/markdown-images";
export type { ExtractedImage } from "./lib/markdown-images";

// Image utilities
export {
  parseDataUrl,
  tryParseDataUrl,
  createDataUrl,
  detectImageFormat,
  detectImageDimensions,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
export type { ParsedDataUrl } from "./lib/image-utils";
