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
  faviconSvgHref?: string | undefined;
  faviconPngHref?: string | undefined;
}

export function essentialHeadTags(paths: EssentialHeadPaths = {}): string[] {
  const stylesheet = paths.stylesheetHref ?? "/styles/main.css";
  const faviconSvg = paths.faviconSvgHref ?? "/favicon.svg";
  const faviconPng = paths.faviconPngHref ?? "/favicon.png";
  return [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<link rel="icon" type="image/svg+xml" href="${faviconSvg}">`,
    `<link rel="icon" type="image/png" href="${faviconPng}">`,
    `<link rel="stylesheet" href="${stylesheet}">`,
  ];
}
