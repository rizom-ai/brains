import { StructuredContentFormatter } from "@brains/utils";
import { footerCTASchema, type FooterCTAContent } from "./schema";

export class FooterCTAFormatter extends StructuredContentFormatter<FooterCTAContent> {
  constructor() {
    super(footerCTASchema, {
      title: "Footer CTA",
      mappings: [],
    });
  }
}
