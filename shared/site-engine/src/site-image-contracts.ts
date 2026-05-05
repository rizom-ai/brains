import type { ImageRenderer } from "@brains/utils";

/** Pre-resolved image ready for rendering in static site output. */
export interface ResolvedSiteImage {
  src: string;
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
}

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
