import { StructuredContentFormatter } from "@brains/utils";
import { WorkProblemContentSchema, type WorkProblemContent } from "./schema";

export const workProblemFormatter =
  new StructuredContentFormatter<WorkProblemContent>(WorkProblemContentSchema, {
    title: "Work Problem Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "subhead", label: "Subhead", type: "string" },
    ],
  });
