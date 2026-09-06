import { z } from "@brains/utils/zod";

/** Instance settings for the one runtime listener. Preview shares its port. */
const httpConfigShape: {
  preview: z.ZodOptional<z.ZodBoolean>;
  productionDistDir: z.ZodOptional<z.ZodString>;
  previewDistDir: z.ZodOptional<z.ZodString>;
  imagesDir: z.ZodOptional<z.ZodString>;
} = {
  preview: z.boolean().optional(),
  productionDistDir: z.string().min(1).optional(),
  previewDistDir: z.string().min(1).optional(),
  imagesDir: z.string().min(1).optional(),
};
export const httpConfigSchema: z.ZodObject<
  typeof httpConfigShape,
  z.core.$strict
> = z.strictObject(httpConfigShape);

export const httpHostConfigSchema: z.ZodObject<
  typeof httpConfigShape & { port: z.ZodDefault<z.ZodNumber> },
  z.core.$strict
> = httpConfigSchema.extend({
  port: z.number().int().min(0).max(65535).default(8080),
});

/** Parsed writer-owned paths; collected once after plugin registration. */
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
export type RegisteredStaticSiteOutput = StaticSiteOutput & {
  ownerPluginId: string;
};
export interface HttpServingInfo {
  /** Finalized serving intent, not transient socket health. */
  isConfigured(): boolean;
}
