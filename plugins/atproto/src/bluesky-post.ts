import type { AtprotoBlobRef } from "./pds-client";
import type { BrainPostRecord } from "./post-record";

const BLUESKY_TEXT_LIMIT = 300;

export interface BlueskyExternalEmbed {
  $type: "app.bsky.embed.external";
  external: {
    uri: string;
    title: string;
    description?: string;
  };
}

export interface BlueskyImagesEmbed {
  $type: "app.bsky.embed.images";
  images: Array<{
    image: AtprotoBlobRef;
    alt: string;
    aspectRatio?: {
      width: number;
      height: number;
    };
  }>;
}

export interface BlueskyFacetTagFeature {
  $type: "app.bsky.richtext.facet#tag";
  tag: string;
}

export interface BlueskyFacetLinkFeature {
  $type: "app.bsky.richtext.facet#link";
  uri: string;
}

export interface BlueskyFacet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<BlueskyFacetTagFeature | BlueskyFacetLinkFeature>;
}

export interface BlueskyFeedPostRecord {
  [key: string]: unknown;
  $type: "app.bsky.feed.post";
  text: string;
  createdAt: string;
  facets?: BlueskyFacet[];
  embed?: BlueskyExternalEmbed | BlueskyImagesEmbed;
}

function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return "…";
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function topicToTag(topic: string): string | undefined {
  const tag = topic.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]+/gu, "");
  return tag.length > 0 ? tag : undefined;
}

function uniqueTags(topics: string[] | undefined): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const topic of topics ?? []) {
    const tag = topicToTag(topic);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function buildTagsSuffix(tags: string[], maxLength: number): string {
  let suffix = "";
  for (const tag of tags) {
    const next = suffix ? `${suffix} #${tag}` : `#${tag}`;
    const candidate = `\n\n${next}`;
    if (candidate.length > maxLength) break;
    suffix = next;
  }
  return suffix ? `\n\n${suffix}` : "";
}

function byteOffset(text: string, index: number): number {
  return new TextEncoder().encode(text.slice(0, index)).length;
}

function buildTagFacets(text: string, tags: string[]): BlueskyFacet[] {
  const facets: BlueskyFacet[] = [];
  let searchFrom = 0;
  for (const tag of tags) {
    const hashtag = `#${tag}`;
    const charStart = text.indexOf(hashtag, searchFrom);
    if (charStart === -1) continue;
    const charEnd = charStart + hashtag.length;
    facets.push({
      index: {
        byteStart: byteOffset(text, charStart),
        byteEnd: byteOffset(text, charEnd),
      },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag }],
    });
    searchFrom = charEnd;
  }
  return facets;
}

function buildLinkFacet(text: string, uri: string): BlueskyFacet | undefined {
  const charStart = text.indexOf(uri);
  if (charStart === -1) return undefined;
  const charEnd = charStart + uri.length;
  return {
    index: {
      byteStart: byteOffset(text, charStart),
      byteEnd: byteOffset(text, charEnd),
    },
    features: [{ $type: "app.bsky.richtext.facet#link", uri }],
  };
}

function buildImageEmbed(
  post: BrainPostRecord,
): BlueskyImagesEmbed | undefined {
  if (!post.coverImage) return undefined;
  const { blob, alt, width, height } = post.coverImage;
  return {
    $type: "app.bsky.embed.images",
    images: [
      {
        image: blob,
        alt: alt ?? "",
        ...(width !== undefined &&
          height !== undefined && { aspectRatio: { width, height } }),
      },
    ],
  };
}

function buildExternalEmbed(
  post: BrainPostRecord,
): BlueskyExternalEmbed | undefined {
  if (!post.canonicalUrl) return undefined;
  return {
    $type: "app.bsky.embed.external" as const,
    external: {
      uri: post.canonicalUrl,
      title: post.title,
      ...(post.summary && { description: post.summary }),
    },
  };
}

export function buildBlueskyPostRecord(
  post: BrainPostRecord,
  now: Date = new Date(),
): BlueskyFeedPostRecord {
  const tags = uniqueTags(post.topics);
  const imageEmbed = buildImageEmbed(post);
  const linkSuffix =
    imageEmbed && post.canonicalUrl ? `\n\n${post.canonicalUrl}` : "";
  const tagsSuffix = buildTagsSuffix(
    tags,
    BLUESKY_TEXT_LIMIT - linkSuffix.length,
  );
  const suffix = `${tagsSuffix}${linkSuffix}`;
  const baseText = post.summary
    ? `${post.title}\n\n${post.summary}`
    : post.title;
  const text = `${truncateText(
    baseText,
    BLUESKY_TEXT_LIMIT - suffix.length,
  )}${suffix}`;
  const linkFacet = post.canonicalUrl
    ? buildLinkFacet(text, post.canonicalUrl)
    : undefined;
  const facets = [
    ...buildTagFacets(text, tags),
    ...(linkFacet ? [linkFacet] : []),
  ];
  const embed = imageEmbed ?? buildExternalEmbed(post);

  return {
    $type: "app.bsky.feed.post",
    text,
    createdAt: post.publishedAt ?? now.toISOString(),
    ...(facets.length > 0 && { facets }),
    ...(embed && { embed }),
  };
}
