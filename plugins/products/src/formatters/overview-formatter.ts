import { StructuredContentFormatter } from "@brains/utils";
import { overviewBodySchema, type OverviewBody } from "../schemas/overview";

/**
 * Formatter for the overview body content.
 * Converts between structured OverviewBody data and markdown sections.
 *
 * The overview body uses structured content (## headings) instead of
 * free-form prose because it has multiple distinct sections (vision,
 * pillars, technologies, benefits, CTA) with no single narrative.
 */
export class OverviewBodyFormatter extends StructuredContentFormatter<OverviewBody> {
  constructor() {
    super(overviewBodySchema, {
      title: "Products Overview",
      mappings: [
        { key: "vision", label: "Vision", type: "string" },
        {
          key: "pillars",
          label: "Core Principles",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "title", label: "Title", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
        {
          key: "approach",
          label: "How It Works",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "title", label: "Title", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
        { key: "productsIntro", label: "Brain Models", type: "string" },
        {
          key: "technologies",
          label: "Built With",
          type: "array",
          itemType: "string",
        },
        {
          key: "benefits",
          label: "Why Brains",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "title", label: "Title", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
        {
          key: "cta",
          label: "Ready to Build",
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
