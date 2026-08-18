/**
 * Syndication feeds, as a contract between the entity that has something to
 * syndicate and the site build that writes the file.
 *
 * An entity declares how one of its entities becomes a feed item and nothing
 * else: it never sees the output directory, the site config, or how a URL is
 * built. The site build owns all three, plus the decision of which entities
 * qualify — published only, or everything when previewing.
 */

/** One entry in a feed, in the shape RSS 2.0 actually needs. */
export interface FeedItem {
  readonly title: string;
  /** Path segment the site build turns into an absolute URL. */
  readonly slug: string;
  readonly description: string;
  /** Full content, rendered into content:encoded. */
  readonly content: string;
  readonly author: string;
  /** ISO date; the entity's own creation time is a reasonable fallback. */
  readonly publishedAt: string;
  readonly category?: string | undefined;
}

/** How a feed's channel-level fields are filled in. */
export interface FeedChannel {
  readonly title: string;
  readonly description: string;
  readonly link: string;
  readonly language?: string | undefined;
  readonly copyright?: string | undefined;
  readonly managingEditor?: string | undefined;
  readonly webMaster?: string | undefined;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** RFC 822, which RSS 2.0 requires for dates. */
function formatRfc822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function itemXml(item: FeedItem, link: string): string {
  const url = `${link}/${item.slug.replace(/^\//u, "")}`;
  const category = item.category
    ? `\n      <category>${escapeXml(item.category)}</category>`
    : "";
  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(item.description)}</description>
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
      <author>${escapeXml(item.author)}</author>
      <pubDate>${formatRfc822(item.publishedAt)}</pubDate>${category}
    </item>`;
}

/**
 * Render an RSS 2.0 document. Items are emitted newest first, and the
 * channel's lastBuildDate follows the newest item so a reader can tell
 * whether anything changed without parsing the body.
 */
export function renderRssFeed(
  items: readonly FeedItem[],
  channel: FeedChannel,
): string {
  const ordered = [...items].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() -
      new Date(left.publishedAt).getTime(),
  );
  const lastBuildDate = formatRfc822(
    ordered[0]?.publishedAt ?? new Date().toISOString(),
  );
  const optional = [
    channel.copyright
      ? `\n    <copyright>${escapeXml(channel.copyright)}</copyright>`
      : "",
    channel.managingEditor
      ? `\n    <managingEditor>${escapeXml(channel.managingEditor)}</managingEditor>`
      : "",
    channel.webMaster
      ? `\n    <webMaster>${escapeXml(channel.webMaster)}</webMaster>`
      : "",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${channel.language ?? "en-us"}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>${optional}
${ordered.map((item) => itemXml(item, channel.link)).join("\n")}
  </channel>
</rss>`;
}
