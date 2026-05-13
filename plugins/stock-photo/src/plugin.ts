import type { Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { UnsplashClient } from "./lib/unsplash-client";
import { createStockPhotoTools } from "./tools";
import { fetchImageAsBase64 } from "@brains/image";
import type { FetchFn, FetchImageFn } from "./lib/types";
import packageJson from "../package.json";

export interface StockPhotoDeps {
  fetch?: FetchFn;
  fetchImage?: FetchImageFn;
}

const stockPhotoConfigSchema = z.object({
  provider: z.enum(["unsplash"]).default("unsplash"),
  apiKey: z.string().optional().describe("Stock photo provider API key"),
});

type StockPhotoConfig = z.infer<typeof stockPhotoConfigSchema>;

export class StockPhotoPlugin extends ServicePlugin<StockPhotoConfig> {
  private readonly deps: StockPhotoDeps;
  private cachedTools: Tool[] | null = null;

  constructor(
    config: Partial<StockPhotoConfig> = {},
    deps: StockPhotoDeps = {},
  ) {
    super("stock-photo", packageJson, config, stockPhotoConfigSchema);
    this.deps = deps;
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.config.apiKey) return [];
    if (this.cachedTools) return this.cachedTools;

    const context = this.getContext();
    const provider = new UnsplashClient(
      this.config.apiKey,
      this.deps.fetch ?? globalThis.fetch,
    );

    this.cachedTools = createStockPhotoTools(this.id, {
      provider,
      entityService: context.entityService,
      fetchImage: this.deps.fetchImage ?? fetchImageAsBase64,
    });

    return this.cachedTools;
  }
}

export function stockPhotoPlugin(
  config: Partial<StockPhotoConfig> = {},
  deps: StockPhotoDeps = {},
): StockPhotoPlugin {
  return new StockPhotoPlugin(config, deps);
}
