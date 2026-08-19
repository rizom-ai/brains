import type { ImageRenderer } from "@brains/contracts";
import { z } from "@brains/utils/zod";

/** Pre-resolved image ready for rendering in static site output. */
export interface ResolvedSiteImage {
  src: string;
  srcset?: string | undefined;
  sizes?: string | undefined;
  width: number;
  height: number;
}

/** Schema for {@link ResolvedSiteImage}, next to the interface it validates. */
export const resolvedSiteImageSchema: z.ZodType<ResolvedSiteImage> = z.object({
  src: z.string(),
  srcset: z.string().optional(),
  sizes: z.string().optional(),
  width: z.number(),
  height: z.number(),
});

export type SiteImageMap = Record<string, ResolvedSiteImage>;

/** Minimal image lookup contract used while enriching site content. */
export interface SiteImageLookup {
  get(imageId: string): ResolvedSiteImage | undefined;
}

/** Minimal renderer contract used by static renderers for markdown images. */
export interface SiteImageRendererService {
  createImageRenderer(): ImageRenderer;
}

/** Combined contract for build-time image services passed to renderers. */
export type SiteImageBuildService = SiteImageLookup & SiteImageRendererService;
