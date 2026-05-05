import { createTemplate } from "@brains/plugins";
import {
  summaryExtractionResultSchema,
  type SummaryExtractionResult,
} from "../schemas/extraction";

export const summaryAiResponseTemplate =
  createTemplate<SummaryExtractionResult>({
    name: "summary:ai-response",
    description:
      "Extract durable summary entries from stored conversation messages",
    schema: summaryExtractionResultSchema,
    dataSourceId: "shell:ai-content",
    useKnowledgeContext: false,
    requiredPermission: "public",
    basePrompt: `You summarize stored conversations into durable, grounded entries.

Split conversations into coherent chronological phases. Preserve important context,
explicit decisions, and concrete action items. Never invent facts, owners, or tasks.
Return only the required structured JSON.`,
  });
