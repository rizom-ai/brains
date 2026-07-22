import {
  siteBuildArtifactManifestSchema,
  type PreparedSiteBuild,
  type SiteBuildArtifactFile,
  type SiteBuildArtifactKind,
  type SiteBuildArtifactManifest,
} from "@brains/site-engine";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { dirname, join, relative, sep } from "path";
import { resolveSafeOutputFile } from "./output-path";

export const SITE_BUILD_MANIFEST_FILE = ".site-build-manifest.json";

export interface CreateSiteBuildArtifactManifestOptions {
  generationDir: string;
  preparedBuild: PreparedSiteBuild;
  warnings: string[];
}

export async function createSiteBuildArtifactManifest(
  options: CreateSiteBuildArtifactManifestOptions,
): Promise<SiteBuildArtifactManifest> {
  const routes = options.preparedBuild.routes.map((route) => ({
    routeId: route.id,
    urlPath: route.path,
    outputFile: getRouteOutputFile(route.path),
  }));
  const routeFiles = new Set(routes.map((route) => route.outputFile));
  const staticAssets = Object.keys(options.preparedBuild.staticAssets)
    .map(normalizeAssetPath)
    .sort();
  const publicAssets = Object.keys(options.preparedBuild.publicAssets).sort();
  const staticAssetFiles = new Set(staticAssets);
  const files = await listArtifactFiles(options.generationDir);
  const filePaths = new Set(files.map((file) => file.path));

  for (const route of routes) {
    if (!filePaths.has(route.outputFile)) {
      throw new Error(
        `Expected route artifact is missing: ${route.routeId} (${route.outputFile})`,
      );
    }
  }
  if (!filePaths.has("styles/main.css")) {
    throw new Error("Expected CSS artifact is missing: styles/main.css");
  }
  for (const path of ["robots.txt", "sitemap.xml"]) {
    if (!filePaths.has(path)) {
      throw new Error(`Expected SEO artifact is missing: ${path}`);
    }
  }
  for (const path of staticAssets) {
    if (!filePaths.has(path)) {
      throw new Error(`Expected static asset is missing: ${path}`);
    }
  }
  for (const path of publicAssets) {
    if (!filePaths.has(path)) {
      throw new Error(`Expected public asset is missing: ${path}`);
    }
  }

  const classifiedFiles = files.map((file): SiteBuildArtifactFile => ({
    ...file,
    kind: classifyArtifact(file.path, routeFiles, staticAssetFiles),
  }));
  const manifest = siteBuildArtifactManifestSchema.parse({
    version: 1,
    buildId: options.preparedBuild.buildId,
    environment: options.preparedBuild.environment,
    routes,
    files: classifiedFiles,
    images: options.preparedBuild.images,
    staticAssets,
    publicAssets,
    scripts: {
      global: options.preparedBuild.globalHeadScripts,
      byRoute: Object.fromEntries(
        options.preparedBuild.routes.map((route) => [
          route.id,
          route.headScripts,
        ]),
      ),
    },
    warnings: options.warnings,
  });

  const manifestPath = resolveSafeOutputFile(
    options.generationDir,
    SITE_BUILD_MANIFEST_FILE,
  );
  await fs.mkdir(dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

function getRouteOutputFile(routePath: string): string {
  if (routePath === "/") return "index.html";
  const routeDirectory = routePath.slice(1).replace(/\/$/, "");
  return `${routeDirectory}/index.html`;
}

function normalizeAssetPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function classifyArtifact(
  path: string,
  routeFiles: Set<string>,
  staticAssetFiles: Set<string>,
): SiteBuildArtifactKind {
  if (staticAssetFiles.has(path)) return "static";
  if (routeFiles.has(path)) return "route";
  if (path === "styles/main.css") return "css";
  if (path === "robots.txt" || path === "sitemap.xml" || path === "feed.xml") {
    return "seo";
  }
  return "public";
}

async function listArtifactFiles(
  generationDir: string,
  directory = generationDir,
): Promise<Array<{ path: string; size: number; sha256: string }>> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files: Array<{ path: string; size: number; sha256: string }> = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Artifact generation contains an unsupported symbolic link: ${entry.name}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await listArtifactFiles(generationDir, fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative(generationDir, fullPath).split(sep).join("/");
    if (path === SITE_BUILD_MANIFEST_FILE) continue;
    const content = await fs.readFile(fullPath);
    files.push({
      path,
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }

  return files;
}
