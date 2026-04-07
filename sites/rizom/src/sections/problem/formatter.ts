import { StructuredContentFormatter } from "@brains/utils";
import { ProblemContentSchema, type ProblemContent } from "./schema";

export class ProblemFormatter extends StructuredContentFormatter<ProblemContent> {
  constructor() {
    super(ProblemContentSchema, {
      title: "Problem Section",
      mappings: [
        {
          key: "cards",
          label: "Cards",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "num", label: "Num", type: "string" },
            { key: "title", label: "Title", type: "string" },
            { key: "body", label: "Body", type: "string" },
          ],
        },
      ],
    });
  }
}
