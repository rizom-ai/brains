import { createStockPhotoPackage } from "./plugin";

export {
  createStockPhotoPackage,
  stockPhotoConfigSchema,
  type StockPhotoConfig,
  type StockPhotoConfigInput,
  type StockPhotoDeps,
} from "./plugin";
export { UnsplashClient } from "./lib/unsplash-client";
export type {
  StockPhotoProvider,
  SearchResult,
  PhotoCandidate,
  SelectResult,
  FetchFn,
  FetchImageFn,
} from "./lib/types";

/** Stock photos as a brain composes them. */
const stockPhotoPackage: ReturnType<typeof createStockPhotoPackage> =
  createStockPhotoPackage();
export default stockPhotoPackage;
