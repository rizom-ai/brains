import type { BlogPostWithData } from "../datasources/blog-datasource";

/**
 * RSS feed configuration
 */
export interface RSSFeedConfig {
  title: string;
  description: string;
  link: string;
  language?: string;
  copyright?: string;
  managingEditor?: string;
  webMaster?: string;
  includeAllPosts?: boolean; // If true, include all posts (for preview), otherwise only published
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format date to RFC 822 format (required by RSS 2.0)
 * Example: "Mon, 01 Jan 2024 10:00:00 GMT"
 */
function formatRFC822Date(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toUTCString();
}

/**
 * Generate RSS 2.0 feed XML from blog posts
 */
export function generateRSSFeed(
  posts: BlogPostWithData[],
  config: RSSFeedConfig,
): string {
  // Filter posts based on config
  const filteredPosts = posts
    .filter((post) => {
      // If includeAllPosts is true (preview mode), include all posts
      if (config.includeAllPosts) {
        return true;
      }
      // Otherwise, only include published posts with publishedAt date
      return (
        post.frontmatter.status === "published" && post.frontmatter.publishedAt
      );
    })
    .sort((a, b) => {
      const aDate = new Date(a.frontmatter.publishedAt ?? a.created);
      const bDate = new Date(b.frontmatter.publishedAt ?? b.created);
      return bDate.getTime() - aDate.getTime();
    });

  // Get the latest publication date for lastBuildDate
  const latestPubDate =
    filteredPosts.length > 0 && filteredPosts[0]
      ? (filteredPosts[0].frontmatter.publishedAt ?? filteredPosts[0].created)
      : new Date().toISOString();

  // Generate XML
  const items = filteredPosts
    .map((post) => {
      const postUrl = `${config.link}/posts/${post.id}`;
      const pubDate = post.frontmatter.publishedAt ?? post.created;
      const excerpt = post.frontmatter.excerpt ?? "";
      const author = post.frontmatter.author ?? "Unknown";

      return `    <item>
      <title>${escapeXml(post.frontmatter.title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      <description>${escapeXml(excerpt)}</description>
      <content:encoded><![CDATA[${post.body}]]></content:encoded>
      <author>${escapeXml(author)}</author>
      <pubDate>${formatRFC822Date(pubDate)}</pubDate>${
        post.frontmatter.seriesName
          ? `
      <category>${escapeXml(post.frontmatter.seriesName)}</category>`
          : ""
      }
    </item>`;
    })
    .join("\n");

  const copyrightTag = config.copyright
    ? `\n    <copyright>${escapeXml(config.copyright)}</copyright>`
    : "";
  const managingEditorTag = config.managingEditor
    ? `\n    <managingEditor>${escapeXml(config.managingEditor)}</managingEditor>`
    : "";
  const webMasterTag = config.webMaster
    ? `\n    <webMaster>${escapeXml(config.webMaster)}</webMaster>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${escapeXml(config.link)}</link>
    <description>${escapeXml(config.description)}</description>
    <language>${config.language ?? "en-us"}</language>
    <lastBuildDate>${formatRFC822Date(latestPubDate)}</lastBuildDate>
    <atom:link href="${escapeXml(config.link)}/feed.xml" rel="self" type="application/rss+xml"/>${copyrightTag}${managingEditorTag}${webMasterTag}
${items}
  </channel>
</rss>`;

  return xml;
}
