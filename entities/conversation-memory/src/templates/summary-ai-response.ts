import { createTemplate } from "@brains/plugins";
import { SUMMARY_AI_TEMPLATE_NAME } from "../lib/constants";
import {
  summaryExtractionResultSchema,
  type SummaryExtractionResult,
} from "../schemas/extraction";

export const summaryAiResponseTemplate =
  createTemplate<SummaryExtractionResult>({
    name: SUMMARY_AI_TEMPLATE_NAME,
    description:
      "Extract durable conversation memory from stored conversation messages",
    schema: summaryExtractionResultSchema,
    dataSourceId: "shell:ai-content",
    useKnowledgeContext: false,
    requiredPermission: "public",
    basePrompt: `Extract durable memory from stored conversations.

Split conversations into coherent chronological phases for summary entries. Preserve
explicit decisions and concrete action items as separate memory fields. Never invent
facts, owners, or tasks. Return only the required structured JSON.`,
  });
