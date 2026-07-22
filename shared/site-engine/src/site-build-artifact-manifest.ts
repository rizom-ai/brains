import { z } from "@brains/utils/zod";
import type { SiteImageMap } from "./site-image-contracts";

export type SiteBuildArtifactKind =
  "route" | "css" | "static" | "seo" | "public";

export interface SiteBuildArtifactFile {
  path: string;
  kind: SiteBuildArtifactKind;
  size: number;
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
  routes: SiteBuildRouteArtifact[];
  files: SiteBuildArtifactFile[];
  images: SiteImageMap;
  staticAssets: string[];
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
});

const routeArtifactSchema: z.ZodType<SiteBuildRouteArtifact> = z.object({
  routeId: z.string(),
  urlPath: z.string(),
  outputFile: z.string(),
});

const resolvedSiteImageSchema = z.object({
  src: z.string(),
  srcset: z.string().optional(),
  sizes: z.string().optional(),
  width: z.number(),
  height: z.number(),
});

export const siteBuildArtifactManifestSchema: z.ZodType<SiteBuildArtifactManifest> =
  z.object({
    version: z.literal(1),
    buildId: z.string().min(1),
    environment: z.enum(["preview", "production"]),
    routes: z.array(routeArtifactSchema),
    files: z.array(artifactFileSchema),
    images: z.record(z.string(), resolvedSiteImageSchema),
    staticAssets: z.array(z.string()),
    scripts: z.object({
      global: z.array(z.string()),
      byRoute: z.record(z.string(), z.array(z.string())),
    }),
    warnings: z.array(z.string()),
  });
