import { StructuredContentFormatter } from "@brains/utils";
import { footerCTASchema, type FooterCTAContent } from "./schema";

export class FooterCTAFormatter extends StructuredContentFormatter<FooterCTAContent> {
  constructor() {
    super(footerCTASchema, {
      title: "Footer CTA",
      mappings: [
        { key: "heading", label: "Heading", type: "string" },
        { key: "buttonText", label: "Button Text", type: "string" },
        { key: "buttonLink", label: "Button Link", type: "string" },
      ],
    });
  }
}
