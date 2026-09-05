import { z } from "@brains/utils/zod";
import { resolvedSiteImageSchema } from "./site-image-contracts";

const artifactFileSchema: z.ZodObject<{
  path: z.ZodString;
  kind: z.ZodEnum<{
    route: "route";
    css: "css";
    static: "static";
    seo: "seo";
    public: "public";
  }>;
  size: z.ZodNumber;
  sha256: z.ZodString;
}> = z.object({
  path: z.string(),
  kind: z.enum(["route", "css", "static", "seo", "public"]),
  size: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export type SiteBuildArtifactFile = z.output<typeof artifactFileSchema>;
export type SiteBuildArtifactKind = SiteBuildArtifactFile["kind"];

const routeArtifactSchema: z.ZodObject<{
  routeId: z.ZodString;
  urlPath: z.ZodString;
  outputFile: z.ZodString;
}> = z.object({
  routeId: z.string(),
  urlPath: z.string(),
  outputFile: z.string(),
});

export type SiteBuildRouteArtifact = z.output<typeof routeArtifactSchema>;

/** Accounting record written into every validated site generation. */
export const siteBuildArtifactManifestSchema: z.ZodObject<{
  version: z.ZodLiteral<1>;
  buildId: z.ZodString;
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
  inputFingerprint: z.ZodOptional<z.ZodString>;
  routes: z.ZodArray<typeof routeArtifactSchema>;
  files: z.ZodArray<typeof artifactFileSchema>;
  images: z.ZodRecord<z.ZodString, typeof resolvedSiteImageSchema>;
  staticAssets: z.ZodArray<z.ZodString>;
  publicAssets: z.ZodArray<z.ZodString>;
  scripts: z.ZodObject<{
    global: z.ZodArray<z.ZodString>;
    byRoute: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
  }>;
  warnings: z.ZodArray<z.ZodString>;
}> = z.object({
  version: z.literal(1),
  buildId: z.string().min(1),
  environment: z.enum(["preview", "production"]),
  /** Hash of effective renderer inputs; absent on manifests from older releases. */
  inputFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  routes: z.array(routeArtifactSchema),
  files: z.array(artifactFileSchema),
  images: z.record(z.string(), resolvedSiteImageSchema),
  staticAssets: z.array(z.string()),
  publicAssets: z.array(z.string()),
  scripts: z.object({
    global: z.array(z.string()),
    byRoute: z.record(z.string(), z.array(z.string())),
  }),
  warnings: z.array(z.string()),
});

export type SiteBuildArtifactManifest = z.output<
  typeof siteBuildArtifactManifestSchema
>;
