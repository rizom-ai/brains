import { siteBuildArtifactManifestSchema } from "@brains/site-engine";
import { getErrorMessage } from "@brains/utils/error";
import { readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { SITE_BUILD_MANIFEST_FILE } from "./site-build-artifact-manifest";
import type { SiteBuildEnvironment } from "./site-build-status";

export type SitePublicationStatus =
  | { state: "not-published" }
  | {
      state: "published";
      buildId: string;
      publishedAt: string;
      routesBuilt: number;
      warnings: string[];
    }
  | { state: "unreadable"; message: string };

/** Read the manifest selected by the active output path, not a status cache. */
export async function readSitePublicationStatus(
  outputDir: string,
  environment: SiteBuildEnvironment,
): Promise<SitePublicationStatus> {
  const manifestPath = join(resolve(outputDir), SITE_BUILD_MANIFEST_FILE);
  try {
    const [source, manifestStat] = await Promise.all([
      readFile(manifestPath, "utf8"),
      stat(manifestPath),
    ]);
    const manifest = siteBuildArtifactManifestSchema.parse(JSON.parse(source));
    if (manifest.environment !== environment) {
      throw new Error(
        `Active manifest environment mismatch: expected ${environment}, found ${manifest.environment}`,
      );
    }
    return {
      state: "published",
      buildId: manifest.buildId,
      publishedAt: manifestStat.mtime.toISOString(),
      routesBuilt: manifest.routes.length,
      warnings: manifest.warnings,
    };
  } catch (error) {
    if (isNotFoundError(error)) return { state: "not-published" };
    return {
      state: "unreadable",
      message: `Unable to read the published ${environment} generation: ${getErrorMessage(error)}`,
    };
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
