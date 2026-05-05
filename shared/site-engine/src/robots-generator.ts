/**
 * Generate robots.txt content based on environment
 */
export function generateRobotsTxt(
  baseUrl: string,
  environment: "preview" | "production",
): string {
  if (environment === "preview") {
    // Preview sites should not be indexed by search engines
    return `User-agent: *
Disallow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
  }

  // Production: allow all crawling
  return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
}
