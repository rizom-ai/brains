export { ImagePlugin, imagePlugin } from "./plugin";
export {
  imageConfigSchema,
  type ImageConfig,
  type ImageConfigInput,
} from "./config";
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
export { imageAdapter, ImageAdapter } from "./adapters/image-adapter";
export { resolveImage } from "./lib/image-resolver";
export {
  parseDataUrl,
  createDataUrl,
  detectImageFormat,
  detectImageDimensions,
  isValidDataUrl,
  isHttpUrl,
  fetchImageAsBase64,
} from "./lib/image-utils";
