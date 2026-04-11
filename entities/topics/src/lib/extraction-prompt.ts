import type { IEntityService } from "@brains/plugins";
import { TopicAdapter } from "./topic-adapter";

const MAX_EXISTING_TOPIC_TITLES = 40;
const topicAdapter = new TopicAdapter();

/**
 * Fetch a small set of existing topic titles so extraction can reuse
 * canonical names instead of inventing near-duplicates.
 */
export async function listExistingTopicTitles(
  entityService: IEntityService,
  limit = MAX_EXISTING_TOPIC_TITLES,
): Promise<string[]> {
  const topics = await entityService.listEntities("topic", { limit });

  return topics
    .map((topic) => topicAdapter.parseTopicBody(topic.content).title)
    .filter((title): title is string => title.trim().length > 0);
}

/**
 * Build the extraction prompt with canonicalization guidance.
 */
export function buildTopicExtractionPrompt(params: {
  entityTitle: string;
  entityType: string;
  content: string;
  existingTopicTitles?: string[];
}): string {
  const existingTitles = (params.existingTopicTitles ?? []).slice(
    0,
    MAX_EXISTING_TOPIC_TITLES,
  );

  const existingTopicsBlock =
    existingTitles.length > 0
      ? `

Existing topic titles to reuse when they clearly fit:
${existingTitles.map((title) => `- ${title}`).join("\n")}`
      : "";

  return `Content Title: ${params.entityTitle}
Content Type: ${params.entityType}

CANONICALIZATION RULES:
- Prefer reusable umbrella topics over article-specific framings, arguments, or sub-angles.
- Reuse an existing topic title exactly when the content clearly belongs to it.
- If multiple possible titles describe the same core idea, choose the broadest stable title and move the nuance into the description and keywords.
- Avoid creating near-duplicates that only differ by actor naming, qualifiers, or rhetorical framing.
- Prefer the base concept over a framed version like "X as Y", "X in Z", or "Angle on X" when they point to the same reusable topic.

Examples of good grouping:
- "Agency in Human-AI Collaboration", "Human-Agent Collaboration", and "AI Collaboration" should usually collapse to one canonical collaboration topic.
- Titles like "Fragmentation as Opportunity" or "Fragmentation in Digital Ecosystems" should usually collapse to the umbrella topic "Fragmentation".
- "Fragmentation and Multiplicity" should usually also collapse to "Fragmentation" when multiplicity is just the angle, not a separate durable domain.
- "Regenerative and Decentralized Design" should usually become the single primary design topic, with the secondary lens moved into keywords/content.${existingTopicsBlock}

Content:
${params.content}`;
}
