import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { UnsplashClient } from "./lib/unsplash-client";
import { createStockPhotoTools } from "./tools";
import { fetchImageAsBase64 } from "@brains/utils";
import packageJson from "../package.json";

type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FetchImageFn = (url: string) => Promise<string>;

export interface StockPhotoDeps {
  fetch?: FetchFn | undefined;
  fetchImage?: FetchImageFn | undefined;
}

const stockPhotoConfigSchema = z.object({
  provider: z.enum(["unsplash"]).default("unsplash"),
  apiKey: z.string().optional().describe("Stock photo provider API key"),
});

type StockPhotoConfig = z.infer<typeof stockPhotoConfigSchema>;

export class StockPhotoPlugin extends ServicePlugin<StockPhotoConfig> {
  private readonly deps: StockPhotoDeps;

  constructor(
    config: Partial<StockPhotoConfig> = {},
    deps: StockPhotoDeps = {},
  ) {
    super("stock-photo", packageJson, config, stockPhotoConfigSchema);
    this.deps = deps;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.config.apiKey) return [];

    const context = this.getContext() as ServicePluginContext;
    const provider = new UnsplashClient(
      this.config.apiKey,
      this.deps.fetch ?? globalThis.fetch,
    );

    return createStockPhotoTools(this.id, {
      provider,
      entityService: context.entityService,
      fetchImage: this.deps.fetchImage ?? fetchImageAsBase64,
    });
  }
}

export function stockPhotoPlugin(
  config: Partial<StockPhotoConfig> = {},
  deps: StockPhotoDeps = {},
): StockPhotoPlugin {
  return new StockPhotoPlugin(config, deps);
}
