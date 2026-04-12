import { StructuredContentFormatter } from "@brains/utils";
import { EventsContentSchema, type EventsContent } from "./schema";

export const eventsFormatter = new StructuredContentFormatter<EventsContent>(
  EventsContentSchema,
  {
    title: "Events Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "subhead", label: "Subhead", type: "string" },
      {
        key: "events",
        label: "Events",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "num", label: "Number", type: "string" },
          { key: "city", label: "City", type: "string" },
          { key: "description", label: "Description", type: "string" },
          { key: "date", label: "Date", type: "string" },
          { key: "anchor", label: "Anchor", type: "string" },
          { key: "actionLabel", label: "Action label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      { key: "primaryCtaLabel", label: "Primary CTA label", type: "string" },
      { key: "primaryCtaHref", label: "Primary CTA href", type: "string" },
      {
        key: "secondaryCtaLabel",
        label: "Secondary CTA label",
        type: "string",
      },
      { key: "secondaryCtaHref", label: "Secondary CTA href", type: "string" },
    ],
  },
);
