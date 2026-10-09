/**
 * The head tags every generated page carries, shared by the head collector
 * and the HTML shell so the two cannot drift.
 *
 * The asset paths are declared inputs rather than strings buried in two
 * modules: consumers laying out a build directory must match these defaults
 * (or pass their own), and that contract is visible here instead of implied.
 */
export interface EssentialHeadPaths {
  stylesheetHref?: string | undefined;
  /** null leaves the icon out, for a build without that file. */
  faviconSvgHref?: string | null | undefined;
  faviconPngHref?: string | null | undefined;
}

import { DEFAULT_FAVICON_SVG } from "@brains/contracts";

/** The icon a build gets when it brings none of its own, the lantern (@brains/contracts). */
export { DEFAULT_FAVICON_SVG };

const rooted = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

const ICON_PATHS = ["/favicon.svg", "/favicon.png"];

/**
 * A build's static assets with the default icon added when neither the
 * static assets nor the app's public assets bring an SVG or PNG icon; a site's
 * own icon, under either name, is left alone.
 */
export function withDefaultIcon(
  staticAssets: Record<string, string>,
  publicAssetPaths: Iterable<string>,
): Record<string, string> {
  const has = new Set([
    ...Object.keys(staticAssets).map(rooted),
    ...Array.from(publicAssetPaths, rooted),
  ]);
  return ICON_PATHS.some((path) => has.has(path))
    ? staticAssets
    : { ...staticAssets, "/favicon.svg": DEFAULT_FAVICON_SVG };
}

/**
 * The icons a build has, so a page links those and no missing ones. With a
 * version (the icon's content hash), the href carries it, so an edge that
 * kept a miss for the bare path is not asked again.
 */
export function iconHeadPaths(
  assetPaths: Iterable<string>,
  version?: string,
): Required<Pick<EssentialHeadPaths, "faviconSvgHref" | "faviconPngHref">> {
  const has = new Set(Array.from(assetPaths, rooted));
  const href = (path: string): string | null =>
    has.has(path) ? (version ? `${path}?v=${version}` : path) : null;
  return {
    faviconSvgHref: href("/favicon.svg"),
    faviconPngHref: href("/favicon.png"),
  };
}

export function essentialHeadTags(paths: EssentialHeadPaths = {}): string[] {
  const stylesheet = paths.stylesheetHref ?? "/styles/main.css";
  const faviconSvg =
    paths.faviconSvgHref === undefined ? "/favicon.svg" : paths.faviconSvgHref;
  const faviconPng =
    paths.faviconPngHref === undefined ? "/favicon.png" : paths.faviconPngHref;
  return [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    // The SVG last: browsers that take the last icon use it and fetch no PNG.
    ...(faviconPng
      ? [`<link rel="icon" type="image/png" href="${faviconPng}">`]
      : []),
    ...(faviconSvg
      ? [`<link rel="icon" type="image/svg+xml" href="${faviconSvg}">`]
      : []),
    `<link rel="stylesheet" href="${stylesheet}">`,
  ];
}
