import { createTemplate } from "@brains/templates";
import { EventsContentSchema, type EventsContent } from "./schema";
import { EventsLayout } from "./layout";
import { eventsFormatter } from "./formatter";

export const eventsTemplate = createTemplate<EventsContent>({
  name: "events",
  description: "Rizom events section — editorial event index",
  schema: EventsContentSchema,
  formatter: eventsFormatter,
  requiredPermission: "public",
  layout: { component: EventsLayout },
});
