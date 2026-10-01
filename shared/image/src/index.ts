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

// Image entity adapter
export { imageAdapter, ImageAdapter } from "./adapters/image-adapter";
export type {
  CreateAssetImageInput,
  ImageDescription,
  CreateImageInput,
} from "./adapters/image-adapter";

// Image resolver utilities
export {
  resolveImage,
  resolveEntityCoverImage,
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
  describeImageBytes,
  IMAGE_HEADER_BYTES,
  detectImageFormat,
  detectImageDimensions,
  detectImageDimensionsFromBytes,
  detectImageFormatFromBytes,
  imageMediaType,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
export type { ImageByteDescription, ParsedDataUrl } from "./lib/image-utils";

// Staging image bytes as assets
export {
  IMAGE_ASSET_MAX_BYTES,
  stageImageEntity,
  type ImageAssetStager,
  type ImageBytesSource,
  type StagedImageEntity,
} from "./lib/stage-image";

// Reading stored image bytes in either storage form
export {
  imageDataUrl,
  readImageBytes,
  type ImageBytes,
  type StoredImage,
} from "./lib/image-bytes";
export {
  classifyInlineImage,
  type InlineImageBlocker,
  type InlineImageVerdict,
} from "./lib/inline-image-migration";
