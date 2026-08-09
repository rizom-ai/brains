// Image entity schemas and types
export {
  imageSchema,
  imageMetadataSchema,
  imageFormatSchema,
  imageIngestionStatusSchema,
  type Image,
  type ImageMetadata,
  type ImageFormat,
  type ImageMediaType,
  type ImageIngestionStatus,
} from "./schemas/image";

// Image entity adapter
export { imageAdapter, ImageAdapter } from "./adapters/image-adapter";
export type {
  CreateImageInput,
  CreatePendingImageInput,
} from "./adapters/image-adapter";

// Frontmatter image-reference utilities
export {
  extractCoverImageId,
  setCoverImageId,
  extractOgImageId,
  setOgImageId,
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
  inspectImageBytes,
  resolveImageBytes,
  isAssetImageContent,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
export type {
  ParsedDataUrl,
  InspectedImage,
  ResolvedImageBytes,
} from "./lib/image-utils";
