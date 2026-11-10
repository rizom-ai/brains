import { z } from "@brains/utils/zod";

/**
 * Where a site builder writes the output the runtime's HTTP host serves: its
 * production and preview sites and the images both share. The host serves
 * what the builder writes, so a builder's paths are the serving paths.
 */
export const staticSiteOutputSchema: z.ZodObject<
  {
    productionOutputDir: z.ZodString;
    previewOutputDir: z.ZodString;
    sharedImagesDir: z.ZodString;
  },
  z.core.$strict
> = z.strictObject({
  productionOutputDir: z.string().min(1),
  previewOutputDir: z.string().min(1),
  sharedImagesDir: z.string().min(1),
});

export type StaticSiteOutput = z.output<typeof staticSiteOutputSchema>;

/** A plugin's site output, with the plugin that declared it. */
export interface RegisteredStaticSiteOutput extends StaticSiteOutput {
  readonly ownerPluginId: string;
}
