import { StructuredContentFormatter } from "@brains/utils";
import { WorkProblemContentSchema, type WorkProblemContent } from "./schema";

export const workProblemFormatter =
  new StructuredContentFormatter<WorkProblemContent>(WorkProblemContentSchema, {
    title: "Work Problem Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headlineStart", label: "Headline start", type: "string" },
      {
        key: "headlineEmphasis",
        label: "Headline emphasis",
        type: "string",
      },
      { key: "headlineEnd", label: "Headline end", type: "string" },
      { key: "subhead", label: "Subhead", type: "string" },
    ],
  });
