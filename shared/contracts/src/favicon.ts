/**
 * The icon a brain's pages carry when the site brings none of its own: the
 * lantern, one light on night, the mark every brain's drawings use for a
 * brain. The webserver answers this path with it when the served output has
 * no such file, and a site build that brings no icon adds it to its output.
 */
export const DEFAULT_FAVICON_PATH = "/favicon.svg";

/** The href a page links: versioned, so an edge that kept a miss for the path is not asked again. */
export const DEFAULT_FAVICON_HREF: string = `${DEFAULT_FAVICON_PATH}?v=lantern`;

export const DEFAULT_FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14132b"/><circle cx="32" cy="32" r="21" fill="#d4af37" opacity=".18"/><circle cx="32" cy="32" r="12" fill="#fff3cf" stroke="#d4af37" stroke-width="5"/></svg>\n';
