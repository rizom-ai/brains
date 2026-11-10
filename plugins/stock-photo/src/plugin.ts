import { defineServicePlugin, z } from "@brains/sdk/services";
import type { ServicePackageDefinition } from "@brains/sdk/services";
import {
  serviceRuntime,
  withJobHandlers,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { fetchImageAsBase64 } from "@brains/image";
import { UnsplashClient } from "./lib/unsplash-client";
import { createStockPhotoTools } from "./tools";
import { selectPhotoJob } from "./handlers/select-photo-handler";
import type { FetchFn, FetchImageFn, StockPhotoProvider } from "./lib/types";

export interface StockPhotoDeps {
  fetch?: FetchFn;
  fetchImage?: FetchImageFn;
}

export const stockPhotoConfigSchema: z.ZodObject<{
  provider: z.ZodDefault<z.ZodEnum<{ unsplash: "unsplash" }>>;
  apiKey: z.ZodOptional<z.ZodString>;
}> = z.object({
  provider: z.enum(["unsplash"]).default("unsplash"),
  apiKey: z.string().optional().describe("Stock photo provider API key"),
});

export type StockPhotoConfig = z.output<typeof stockPhotoConfigSchema>;
export type StockPhotoConfigInput = z.input<typeof stockPhotoConfigSchema>;

/** What the package holds once set up: no provider without an API key. */
interface StockPhotoState {
  readonly provider: StockPhotoProvider | undefined;
  readonly fetchImage: FetchImageFn;
}

/**
 * Stock photo search and selection. Search asks the provider; select
 * queues the job that tracks the download, stores the photo as an image
 * and sets it as a target's cover. Without an API key it offers neither.
 */
export function createStockPhotoPackage(
  deps: StockPhotoDeps = {},
): ServicePackageDefinition<typeof stockPhotoConfigSchema> {
  const service = defineServicePlugin({
    id: "stock-photo",
    config: stockPhotoConfigSchema,
    setup: ({ config }): StockPhotoState => ({
      provider: config.apiKey
        ? new UnsplashClient(config.apiKey, deps.fetch ?? globalThis.fetch)
        : undefined,
      fetchImage: deps.fetchImage ?? fetchImageAsBase64,
    }),
  });
  return withTools<typeof stockPhotoConfigSchema, StockPhotoState>(
    withJobHandlers<typeof stockPhotoConfigSchema, StockPhotoState>(
      service,
      (context) => {
        const { provider, fetchImage } = context.state;
        if (!provider) return [];
        const runtime = serviceRuntime(context);
        return [
          selectPhotoJob({
            provider,
            fetchImage,
            entityService: {
              getEntity: runtime.entityReads.getEntity,
              ...runtime.entityWrites,
            },
          }),
        ];
      },
    ),
    (context) => {
      const { provider, fetchImage } = context.state;
      if (!provider) return [];
      const runtime = serviceRuntime(context);
      return createStockPhotoTools("stock-photo", {
        provider,
        entityService: {
          listEntities: runtime.entityReads.listEntities,
          getEntity: runtime.entityReads.getEntity,
          ...runtime.entityWrites,
        },
        fetchImage,
        jobs: runtime.jobs,
      });
    },
  );
}
