import { StructuredContentFormatter } from "@brains/utils";
import { AnswerContentSchema, type AnswerContent } from "./schema";

export const answerFormatter = new StructuredContentFormatter<AnswerContent>(
  AnswerContentSchema,
  {
    title: "Answer Section",
    mappings: [
      { key: "badge", label: "Badge", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "subhead", label: "Subhead", type: "string" },
      { key: "scalesHeadline", label: "Scales Headline", type: "string" },
      { key: "scalesSubhead", label: "Scales Subhead", type: "string" },
    ],
  },
);
