import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";

export const topicMergeSynthesisSchema = z.object({
  title: z.string().max(100),
  content: z.string(),
});

export type TopicMergeSynthesisResult = z.infer<
  typeof topicMergeSynthesisSchema
>;

export const topicMergeSynthesisTemplate =
  createTemplate<TopicMergeSynthesisResult>({
    name: "topics:merge-synthesis",
    description: "Synthesize a canonical topic from two mergeable topics",
    dataSourceId: "shell:ai-content",
    schema: topicMergeSynthesisSchema,
    basePrompt: `You are consolidating two topic variants into one canonical reusable topic.

Your job is to synthesize a BETTER single topic, not to concatenate them.

RULES:
- Produce one canonical title representing the shared reusable domain.
- Prefer stable umbrella topics over rhetorical framings, sub-angles, or article-specific wording.
- Keep the strongest useful nuance from both inputs in the merged content.
- Do not mention that this was a merge.
- Title must be concise and represent one concept.

Return JSON with:
- title
- content`,
    requiredPermission: "public",
  });
