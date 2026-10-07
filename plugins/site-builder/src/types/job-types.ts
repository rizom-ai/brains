import { siteMetadataSchema } from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import { SiteBuildDiagnosticSchema } from "./site-builder-types";

/** What a build is asked to render, and where. */
export const siteBuildJobSchema: z.ZodObject<{
  environment: z.ZodOptional<
    z.ZodEnum<{ preview: "preview"; production: "production" }>
  >;
  outputDir: z.ZodString;
  workingDir: z.ZodOptional<z.ZodString>;
  enableContentGeneration: z.ZodOptional<z.ZodBoolean>;
  siteConfig: z.ZodOptional<typeof siteMetadataSchema>;
  inputGeneration: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  environment: z.enum(["preview", "production"]).optional(),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().optional(),
  siteConfig: siteMetadataSchema.optional(),
  /** Automatic content-change generation observed when this build was queued. */
  inputGeneration: z.number().int().nonnegative().optional(),
});

export type SiteBuildJobData = z.output<typeof siteBuildJobSchema>;

/** What the build says it did, which is what the projection records. */
export const siteBuildJobResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  cancelled: z.ZodOptional<z.ZodBoolean>;
  skipped: z.ZodOptional<z.ZodBoolean>;
  routesBuilt: z.ZodNumber;
  outputDir: z.ZodString;
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
  errors: z.ZodOptional<z.ZodArray<z.ZodString>>;
  warnings: z.ZodOptional<z.ZodArray<z.ZodString>>;
  diagnostics: z.ZodOptional<z.ZodArray<typeof SiteBuildDiagnosticSchema>>;
}> = z.object({
  success: z.boolean(),
  cancelled: z.boolean().optional(),
  skipped: z.boolean().optional(),
  routesBuilt: z.number().int().nonnegative(),
  outputDir: z.string(),
  environment: z.enum(["preview", "production"]),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  diagnostics: z.array(SiteBuildDiagnosticSchema).optional(),
});

export type SiteBuildJobResult = z.output<typeof siteBuildJobResultSchema>;

export type {
  SiteBuildCompletedPayload,
  SiteBuildStagingPayload,
} from "@brains/contracts";
