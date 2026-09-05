import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { fetchImageAsBase64 } from "@brains/image";
import { UnsplashClient } from "./lib/unsplash-client";
import type { FetchFn, FetchImageFn, StockPhotoProvider } from "./lib/types";
import { handleSelectPhoto } from "./select-photo-job";
import { searchTool, selectTool } from "./tools";

/**
 * Stock photo search and selection.
 *
 * Search asks the provider; select queues a job that tracks the download,
 * fetches the picture, and hands it to the image type's own create route. The
 * image package names, stores and links it — stock-photo owns no entity type
 * and writes none.
 */

export const stockPhotoConfigSchema: z.ZodObject<{
  provider: z.ZodDefault<z.ZodEnum<{ unsplash: "unsplash" }>>;
  apiKey: z.ZodOptional<z.ZodString>;
}> = z.object({
  provider: z.enum(["unsplash"]).default("unsplash"),
  apiKey: z.string().optional().describe("Stock photo provider API key"),
});

export type StockPhotoConfig = z.output<typeof stockPhotoConfigSchema>;
export type StockPhotoConfigInput = z.input<typeof stockPhotoConfigSchema>;

/**
 * What this package reaches the outside world through, for a test to supply.
 *
 * Production passes nothing: the provider is built from the configured key
 * over the global fetch, and images are fetched the way every image is.
 */
export interface StockPhotoDependencies {
  readonly fetch?: FetchFn | undefined;
  readonly fetchImage?: FetchImageFn | undefined;
  /** A provider handed over whole, in place of one built from the key. */
  readonly provider?: StockPhotoProvider | undefined;
}

interface StockPhotoState {
  readonly provider: StockPhotoProvider | undefined;
  readonly fetchImage: FetchImageFn;
}

export function stockPhotoService(
  dependencies: StockPhotoDependencies = {},
): ServicePackageDefinition<typeof stockPhotoConfigSchema> {
  return defineServicePlugin({
    id: "stock-photo",
    config: stockPhotoConfigSchema,

    // No key, no provider — and no tools or job either, rather than tools
    // that could only answer "not configured".
    setup: ({ config }): StockPhotoState => ({
      provider:
        dependencies.provider ??
        (config.apiKey
          ? new UnsplashClient(
              config.apiKey,
              dependencies.fetch ?? globalThis.fetch,
            )
          : undefined),
      fetchImage: dependencies.fetchImage ?? fetchImageAsBase64,
    }),

    tools: ({ state, jobs }) =>
      state.provider ? [searchTool(state.provider), selectTool(jobs)] : [],

    jobs: ({ state }) =>
      state.provider
        ? [
            handleSelectPhoto({
              provider: state.provider,
              fetchImage: state.fetchImage,
            }),
          ]
        : [],
  });
}

/** The package as a deployment installs it: no injected dependencies. */
const stockPhotoPackage: ServicePackageDefinition<
  typeof stockPhotoConfigSchema
> = stockPhotoService();

export default stockPhotoPackage;

export { UnsplashClient } from "./lib/unsplash-client";
export {
  photoCandidateSchema,
  searchResultSchema,
  type FetchFn,
  type FetchImageFn,
  type PhotoCandidate,
  type SearchResult,
  type StockPhotoProvider,
} from "./lib/types";
export {
  selectPhotoInputSchema,
  selectPhotoJob,
  type SelectPhotoInput,
} from "./select-photo-job";
