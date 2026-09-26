/** How many existing titles extraction is shown, so it reuses canonical
 * names instead of inventing near-duplicates without flooding the prompt. */
const MAX_EXISTING_TOPIC_TITLES = 40;

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

TOPIC GRANULARITY CONTRACT:
- A topic is a durable knowledge domain expected to accumulate multiple source entities over time.
- Create topics for stable concepts, domains, practices, or enduring questions.
- Create topics for durable domains, never operational activities, deliverables, launch steps, staging deployments, landing page copy, todos, action plans, or one-off tasks.
- At small corpus sizes, prefer fewer broader topics over narrow artifacts.

CANONICALIZATION RULES:
- Prefer reusable umbrella topics over article-specific framings, arguments, or sub-angles.
- Reuse an existing topic title exactly when the content clearly belongs to it.
- If multiple possible titles describe the same core idea, choose the broadest stable title and move the nuance into the description and content.
- Avoid creating near-duplicates that only differ by actor naming, qualifiers, or rhetorical framing.
- Prefer the base concept over a framed version like "X as Y", "X in Z", or "Angle on X" when they point to the same reusable topic.

Examples of good grouping:
- "Agency in Human-AI Collaboration", "Human-Agent Collaboration", and "AI Collaboration" should usually collapse to one canonical collaboration topic.
- Titles like "Fragmentation as Opportunity" or "Fragmentation in Digital Ecosystems" should usually collapse to the umbrella topic "Fragmentation".
- "Fragmentation and Multiplicity" should usually also collapse to "Fragmentation" when multiplicity is just the angle, not a separate durable domain.
- "Regenerative and Decentralized Design" should usually become the single primary design topic, with the secondary lens moved into the topic content.${existingTopicsBlock}

Content:
${params.content}`;
}
