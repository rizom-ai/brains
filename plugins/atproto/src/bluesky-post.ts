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

export interface BlueskyFeedPostRecord {
  [key: string]: unknown;
  $type: "app.bsky.feed.post";
  text: string;
  createdAt: string;
  embed?: BlueskyExternalEmbed;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildBlueskyPostRecord(
  post: BrainPostRecord,
  now: Date = new Date(),
): BlueskyFeedPostRecord {
  const text = truncateText(
    post.summary ? `${post.title}\n\n${post.summary}` : post.title,
    BLUESKY_TEXT_LIMIT,
  );

  return {
    $type: "app.bsky.feed.post",
    text,
    createdAt: post.publishedAt ?? now.toISOString(),
    ...(post.canonicalUrl && {
      embed: {
        $type: "app.bsky.embed.external" as const,
        external: {
          uri: post.canonicalUrl,
          title: post.title,
          ...(post.summary && { description: post.summary }),
        },
      },
    }),
  };
}
