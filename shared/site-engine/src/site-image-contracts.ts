import type { ImageRenderer } from "@brains/contracts";
import { z } from "@brains/utils/zod";

/** Pre-resolved image ready for rendering in static site output. */
export const resolvedSiteImageSchema: z.ZodObject<{
  src: z.ZodString;
  srcset: z.ZodOptional<z.ZodString>;
  sizes: z.ZodOptional<z.ZodString>;
  width: z.ZodNumber;
  height: z.ZodNumber;
  alt: z.ZodOptional<z.ZodString>;
}> = z.object({
  src: z.string(),
  srcset: z.string().optional(),
  sizes: z.string().optional(),
  width: z.number(),
  height: z.number(),
  /** The image's own alt text, when it describes the image. */
  alt: z.string().optional(),
});

export type ResolvedSiteImage = z.output<typeof resolvedSiteImageSchema>;

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
