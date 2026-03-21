import { StructuredContentFormatter } from "@brains/utils";
import { AboutContentSchema, type AboutContent } from "./schema";

export class AboutFormatter extends StructuredContentFormatter<AboutContent> {
  constructor() {
    super(AboutContentSchema, {
      title: "About",
      mappings: [{ key: "markdown", label: "Content", type: "string" }],
    });
  }
}
