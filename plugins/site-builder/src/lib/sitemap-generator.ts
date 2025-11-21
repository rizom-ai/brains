import type { RouteDefinition } from "../types/routes";

interface SitemapEntry {
  url: string;
  lastmod: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
}

/**
 * Escape special XML characters
 */
function escapeXml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

/**
 * Generate sitemap.xml content from routes
 */
export function generateSitemap(
  routes: RouteDefinition[],
  baseUrl: string,
): string {
  const lastmod = new Date().toISOString();

  const entries: SitemapEntry[] = routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastmod,
    // Homepage changes more frequently
    changefreq: route.path === "/" ? "daily" : "weekly",
    // Homepage has highest priority
    priority: route.path === "/" ? 1.0 : 0.8,
  }));

  const urlEntries = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${entry.lastmod}</lastmod>${entry.changefreq ? `\n    <changefreq>${entry.changefreq}</changefreq>` : ""}${entry.priority !== undefined ? `\n    <priority>${entry.priority}</priority>` : ""}
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;
}
