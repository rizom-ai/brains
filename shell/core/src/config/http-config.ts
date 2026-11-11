import { z } from "@brains/utils/zod";

/**
 * The `http` section of brain.yaml: how the runtime's one listener serves.
 * The port is brain.yaml's top-level `port`; preview shares it, chosen by
 * the request's host.
 */
export const httpSettingsSchema: z.ZodObject<
  {
    enabled: z.ZodOptional<z.ZodBoolean>;
    preview: z.ZodOptional<z.ZodBoolean>;
    hostname: z.ZodOptional<z.ZodString>;
    productionDistDir: z.ZodOptional<z.ZodString>;
    previewDistDir: z.ZodOptional<z.ZodString>;
    sharedImagesDir: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  enabled: z
    .boolean()
    .optional()
    .describe(
      "Serve HTTP; defaults to whether the selected bundles host the web surface",
    ),
  preview: z
    .boolean()
    .optional()
    .describe(
      "Serve the preview site; defaults to whether a site builder runs",
    ),
  hostname: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Bind address; use 127.0.0.1 for isolated local tests"),
  productionDistDir: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory of the production site, when no site builder writes it",
    ),
  previewDistDir: z
    .string()
    .min(1)
    .optional()
    .describe("Directory of the preview site, when no site builder writes it"),
  sharedImagesDir: z
    .string()
    .min(1)
    .optional()
    .describe("Directory of shared optimized images"),
});

export type HttpSettings = z.output<typeof httpSettingsSchema>;

/** The shell's resolved HTTP host configuration. */
export const httpHostConfigSchema: z.ZodObject<
  {
    enabled: z.ZodDefault<z.ZodBoolean>;
    preview: z.ZodDefault<z.ZodBoolean>;
    hostname: z.ZodOptional<z.ZodString>;
    productionDistDir: z.ZodOptional<z.ZodString>;
    previewDistDir: z.ZodOptional<z.ZodString>;
    sharedImagesDir: z.ZodOptional<z.ZodString>;
    port: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
> = httpSettingsSchema.extend({
  enabled: z.boolean().default(false),
  preview: z.boolean().default(true),
  port: z.number().default(8080).describe("Port of the production listener"),
});

export type HttpHostConfig = z.output<typeof httpHostConfigSchema>;
export type HttpHostConfigInput = z.input<typeof httpHostConfigSchema>;
