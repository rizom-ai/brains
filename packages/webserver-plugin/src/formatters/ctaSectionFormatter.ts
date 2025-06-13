import { StructuredContentFormatter } from "@brains/structured-content";
import { ctaSectionSchema, type CTASection } from "../content-schemas";

export class CTASectionFormatter extends StructuredContentFormatter<CTASection> {
  constructor() {
    super(ctaSectionSchema, {
      title: "CTA Section",
      mappings: [
        { key: "headline", label: "Headline", type: "string" },
        { key: "description", label: "Description", type: "string" },
        {
          key: "primaryButton",
          label: "Primary Button",
          type: "object",
          children: [
            { key: "text", label: "Text", type: "string" },
            { key: "link", label: "Link", type: "string" },
          ],
        },
        {
          key: "secondaryButton",
          label: "Secondary Button",
          type: "object",
          children: [
            { key: "text", label: "Text", type: "string" },
            { key: "link", label: "Link", type: "string" },
          ],
        },
      ],
    });
  }
}
