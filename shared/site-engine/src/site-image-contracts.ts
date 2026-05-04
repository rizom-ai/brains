import type { ImageRenderer } from "@brains/utils";

/** Minimal image entity shape needed by site image build utilities. */
export interface SiteImageEntity {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
}

/** Minimal entity lookup contract needed by site image build utilities. */
export interface SiteImageEntityService {
  getEntity(entityType: "image", id: string): Promise<SiteImageEntity | null>;
}

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
