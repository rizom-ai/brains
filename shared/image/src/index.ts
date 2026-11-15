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

// Image entity data
export {
  createAssetImageEntity,
  createImageEntity,
  createPendingImageEntity,
  imageMetadataFor,
} from "./lib/image-entity";
export type {
  CreateAssetImageInput,
  CreateImageInput,
  ImageDescription,
} from "./lib/image-entity";

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
export {
  extractMarkdownImages,
  mapMarkdownImageUrls,
} from "./lib/markdown-images";
export type { ExtractedImage } from "./lib/markdown-images";

// Image utilities
export {
  parseDataUrl,
  tryParseDataUrl,
  createDataUrl,
  base64ImageReader,
  bytesImageReader,
  describeImage,
  describeImageBytes,
  fileImageReader,
  detectImageFormat,
  detectImageDimensions,
  detectImageDimensionsFromBytes,
  detectImageFormatFromBytes,
  imageMediaType,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
export type {
  ImageByteDescription,
  ImageByteReader,
  ParsedDataUrl,
} from "./lib/image-utils";

// Staging image bytes as assets
export {
  IMAGE_ASSET_MAX_BYTES,
  IMAGE_ASSET_MEDIA_TYPES,
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
