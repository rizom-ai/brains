import { StructuredContentFormatter } from "@brains/utils";
import { TutorialContentSchema, type TutorialContent } from "./schema";

export class TutorialFormatter extends StructuredContentFormatter<TutorialContent> {
  constructor() {
    super(TutorialContentSchema, {
      title: "Tutorial",
      mappings: [{ key: "markdown", label: "Content", type: "string" }],
    });
  }
}
