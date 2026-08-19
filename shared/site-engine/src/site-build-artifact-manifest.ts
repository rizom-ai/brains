import { z } from "@brains/utils/zod";
import { resolvedSiteImageSchema } from "./site-image-contracts";
import type { SiteImageMap } from "./site-image-contracts";

export type SiteBuildArtifactKind =
  "route" | "css" | "static" | "seo" | "public";

export interface SiteBuildArtifactFile {
  path: string;
  kind: SiteBuildArtifactKind;
  size: number;
  sha256: string;
}

export interface SiteBuildRouteArtifact {
  routeId: string;
  urlPath: string;
  outputFile: string;
}

/** Accounting record written into every validated site generation. */
export interface SiteBuildArtifactManifest {
  version: 1;
  buildId: string;
  environment: "preview" | "production";
  /** Hash of effective renderer inputs; absent on manifests from older releases. */
  inputFingerprint?: string | undefined;
  routes: SiteBuildRouteArtifact[];
  files: SiteBuildArtifactFile[];
  images: SiteImageMap;
  staticAssets: string[];
  publicAssets: string[];
  scripts: {
    global: string[];
    byRoute: Record<string, string[]>;
  };
  warnings: string[];
}

const artifactFileSchema: z.ZodType<SiteBuildArtifactFile> = z.object({
  path: z.string(),
  kind: z.enum(["route", "css", "static", "seo", "public"]),
  size: z.number().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const routeArtifactSchema: z.ZodType<SiteBuildRouteArtifact> = z.object({
  routeId: z.string(),
  urlPath: z.string(),
  outputFile: z.string(),
});

export const siteBuildArtifactManifestSchema: z.ZodType<SiteBuildArtifactManifest> =
  z.object({
    version: z.literal(1),
    buildId: z.string().min(1),
    environment: z.enum(["preview", "production"]),
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
