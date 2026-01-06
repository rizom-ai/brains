// Image entity schemas and types
export {
  imageSchema,
  imageMetadataSchema,
  imageFormatSchema,
  resolvedImageSchema,
  type Image,
  type ImageMetadata,
  type ImageFormat,
  type ResolvedImage,
} from "./schemas/image";

// Image entity adapter
export { imageAdapter, ImageAdapter } from "./adapters/image-adapter";
export type { CreateImageInput } from "./adapters/image-adapter";

// Image resolver utility
export { resolveImage } from "./lib/image-resolver";

// Image utilities
export {
  parseDataUrl,
  createDataUrl,
  detectImageFormat,
  detectImageDimensions,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
export type { ParsedDataUrl } from "./lib/image-utils";
