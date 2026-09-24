export { optimizeImageFile } from "./responsive-image";
export type {
  ResponsiveImageRequest,
  ResponsiveImageManifest,
  ResponsiveImageVariant,
} from "./responsive-image-contract";

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
  type ImageMediaType,
  type ImageIngestionStatus,
  type ResolvedImage,
} from "./schemas/image";

export {
  imageAssetFactsSchema,
  type ImageAssetFacts,
} from "./schemas/image-asset-facts";
export {
  prepareImageAsset,
  type PreparedImageAsset,
} from "./lib/prepare-image-asset";

// Image entity adapter
export { imageAdapter, ImageAdapter } from "./adapters/image-adapter";
export type {
  CreateImageInput,
  CreatePendingImageInput,
} from "./adapters/image-adapter";

// Image and frontmatter image-reference utilities
export {
  extractCoverImageId,
  setCoverImageId,
  extractOgImageId,
  setOgImageId,
} from "./lib/image-resolver";

// Markdown image utilities
export {
  extractMarkdownImages,
  mapMarkdownImageUrls,
} from "./lib/markdown-images";
export type { ExtractedImage } from "./lib/markdown-images";

// Image utilities
export {
  detectImageFormat,
  detectImageDimensions,
  inspectImageBytes,
  isAssetImageContent,
  isHttpUrl,
} from "./lib/image-utils";
export type { InspectedImage } from "./lib/image-utils";
