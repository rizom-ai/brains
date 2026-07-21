import { createTemplate, type Template } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface TopicMergeSynthesisResult {
  verdict: "merge" | "distinct";
  title: string;
  content: string;
}

export const topicMergeSynthesisSchema: z.ZodType<
  TopicMergeSynthesisResult,
  TopicMergeSynthesisResult
> = z.object({
  verdict: z.enum(["merge", "distinct"]),
  title: z.string().max(100),
  content: z.string(),
});

export const topicMergeSynthesisTemplate: Template =
  createTemplate<TopicMergeSynthesisResult>({
    name: "topics:merge-synthesis",
    description: "Synthesize a canonical topic from two mergeable topics",
    dataSourceId: "shell:ai-content",
    schema: topicMergeSynthesisSchema,
    basePrompt: `You are consolidating two topic variants into one canonical reusable topic.

Your job is to decide whether the two candidates are the same reusable topic.
If they are the same durable knowledge domain, synthesize a BETTER single topic.
If they are meaningfully distinct domains, return verdict "distinct" and keep the incoming title/content.

RULES:
- Return verdict "merge" only when both candidates belong to the same durable knowledge domain.
- Return verdict "distinct" for adjacent-but-separate domains, one-off work products, or process artifacts.
- For merge, produce one canonical title representing the shared reusable domain.
- Prefer stable umbrella topics over rhetorical framings, sub-angles, or article-specific wording.
- Keep the strongest useful nuance from both inputs in the merged content.
- Do not mention that this was a merge.
- Title must be concise and represent one concept.

Return JSON with:
- verdict: "merge" or "distinct"
- title
- content`,
    requiredPermission: "public",
  });
