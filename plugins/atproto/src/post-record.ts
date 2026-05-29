import type { BaseEntity } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";

const blogPostFrontmatterProjectionSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: z.enum(["draft", "queued", "published"]),
  publishedAt: z.string().datetime().optional(),
  excerpt: z.string(),
  author: z.string(),
  canonicalUrl: z.string().url().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
});

export interface BuildPostRecordOptions {
  brainDid?: string;
  anchorDid?: string;
  topics?: string[];
}

export interface BrainPostRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.post";
  title: string;
  summary?: string;
  body: string;
  format: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  canonicalUrl?: string;
  topics?: string[];
  series?: string;
  seriesIndex?: number;
  sourceEntityType: "post";
  sourceEntityId: string;
  createdAt: string;
  publishedAt?: string;
}

export function buildPostRecord(
  entity: BaseEntity,
  options: BuildPostRecordOptions = {},
): BrainPostRecord {
  if (entity.entityType !== "post") {
    throw new Error(`Expected entityType post, got ${entity.entityType}`);
  }

  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    blogPostFrontmatterProjectionSchema,
  );
  const frontmatter = parsed.metadata;

  return {
    $type: "ai.rizom.brain.post",
    title: frontmatter.title,
    summary: frontmatter.excerpt,
    body: parsed.content,
    format: "text/markdown",
    ...(options.brainDid && { brainDid: options.brainDid }),
    ...(options.anchorDid && { anchorDid: options.anchorDid }),
    ...(frontmatter.canonicalUrl && { canonicalUrl: frontmatter.canonicalUrl }),
    ...(options.topics &&
      options.topics.length > 0 && { topics: options.topics }),
    ...(frontmatter.seriesName && { series: frontmatter.seriesName }),
    ...(frontmatter.seriesIndex !== undefined && {
      seriesIndex: frontmatter.seriesIndex,
    }),
    sourceEntityType: "post",
    sourceEntityId: entity.id,
    createdAt: entity.created,
    ...(frontmatter.publishedAt && { publishedAt: frontmatter.publishedAt }),
  };
}
