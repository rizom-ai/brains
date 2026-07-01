import { createTemplate } from "@brains/plugins";
import {
  whitepaperDraftExpansionSchema,
  type WhitepaperDraftExpansion,
} from "./generation-template";

export const whitepaperDraftExpansionTemplate =
  createTemplate<WhitepaperDraftExpansion>({
    name: "whitepaper:draft-expansion",
    description: "Template for expanding white paper outlines into drafts",
    schema: whitepaperDraftExpansionSchema,
    dataSourceId: "shell:ai-content",
    requiredPermission: "public",
    useKnowledgeContext: true,
    basePrompt: `You are expanding an outline-stage white paper into a draft.

Your task is to turn the provided outline/source material into a coherent draft while preserving the same white paper topic and structure.

Always return non-empty values for title, thesis, abstract, keywords, and body. Return subtitle as an empty string if none is needed.

Guidelines:
1. Produce draft prose, not just an outline.
2. Keep top-level sections as second-level markdown headings (##). Do not use first-level # headings in the body.
3. Preserve the outline's core structure unless there is a clear reason to improve it.
4. Expand bullets into paragraphs with concrete explanations, tradeoffs, and examples.
5. Keep the draft concise enough for review; prefer a strong first draft over an exhaustive final report.
6. Do not invent citations, quotes, or source claims unless source material is provided.
7. Mark unresolved claims or missing evidence as review notes in the relevant section rather than pretending certainty.
8. Avoid generic marketing language. Write as a strategic white paper for institutional decision makers.`,
  });
