import { compareIds } from "@brains/utils/sort";
import { escapeXml } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

/**
 * Syndication feeds, as a contract between the entity that has something to
 * syndicate and the site build that writes the file.
 *
 * An entity says how one of its records becomes a feed item and nothing
 * else: the site build owns the output directory, the site config, how a
 * slug becomes a URL, and which records qualify.
 */

type FeedItemSchema = z.ZodObject<{
  title: z.ZodString;
  slug: z.ZodString;
  description: z.ZodString;
  content: z.ZodString;
  author: z.ZodString;
  publishedAt: z.ZodISODateTime;
  category: z.ZodOptional<z.ZodString>;
}>;

/** One entry in a feed, in the shape RSS 2.0 needs. */
export const feedItemSchema: FeedItemSchema = z.object({
  title: z.string().min(1),
  /** Path segment the site build turns into an absolute URL. */
  slug: z.string().min(1),
  description: z.string(),
  /** Full content, rendered into content:encoded. */
  content: z.string(),
  author: z.string(),
  /** ISO date-time; a record's creation time is a reasonable fallback. */
  publishedAt: z.iso.datetime({ offset: true }),
  category: z.string().min(1).optional(),
});

/** What an entity's `toItem` returns. */
export type FeedItem = z.input<typeof feedItemSchema>;

/** A feed item the renderer accepts, once validated. */
export type ValidFeedItem = z.output<typeof feedItemSchema>;

/** A feed's channel-level fields. */
export interface FeedChannel {
  readonly title: string;
  readonly description: string;
  readonly link: string;
  /** Where the feed itself is served, for the Atom self link. */
  readonly selfLink: string;
  readonly language?: string | undefined;
  readonly copyright?: string | undefined;
}

/** A CDATA section cannot contain its own terminator, so split it. */
function cdata(text: string): string {
  return `<![CDATA[${text.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/** RFC 822, which RSS 2.0 requires for dates. */
function rfc822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

function itemXml(item: ValidFeedItem, url: string): string {
  const category = item.category
    ? `\n      <category>${escapeXml(item.category)}</category>`
    : "";
  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(item.description)}</description>
      <content:encoded>${cdata(item.content)}</content:encoded>
      <author>${escapeXml(item.author)}</author>
      <pubDate>${rfc822(item.publishedAt)}</pubDate>${category}
    </item>`;
}

/**
 * Render an RSS 2.0 document. Items are emitted newest first, by slug when
 * published at the same moment, and the channel's lastBuildDate follows the
 * newest item so a reader can tell whether anything changed without parsing
 * the body. The document ends at its closing tag.
 */
export function renderRssFeed(
  items: readonly ValidFeedItem[],
  channel: FeedChannel,
  itemUrl: (item: ValidFeedItem) => string,
): string {
  const ordered = [...items].sort(
    (left, right) =>
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
      compareIds(left.slug, right.slug),
  );
  const lastBuildDate = rfc822(
    ordered[0]?.publishedAt ?? new Date().toISOString(),
  );
  const copyright = channel.copyright
    ? `\n    <copyright>${escapeXml(channel.copyright)}</copyright>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${escapeXml(channel.language ?? "en-us")}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(channel.selfLink)}" rel="self" type="application/rss+xml"/>${copyright}
${ordered.map((item) => itemXml(item, itemUrl(item))).join("\n")}
  </channel>
</rss>`;
}
