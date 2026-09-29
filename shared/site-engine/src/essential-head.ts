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

/** The icons a build has, so a page links those and no missing ones. */
export function iconHeadPaths(
  assetPaths: Iterable<string>,
): Required<Pick<EssentialHeadPaths, "faviconSvgHref" | "faviconPngHref">> {
  const has = new Set(
    Array.from(assetPaths, (path) =>
      path.startsWith("/") ? path : `/${path}`,
    ),
  );
  return {
    faviconSvgHref: has.has("/favicon.svg") ? "/favicon.svg" : null,
    faviconPngHref: has.has("/favicon.png") ? "/favicon.png" : null,
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
