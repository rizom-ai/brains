import { createTemplate } from "@brains/templates";
import { RelayContentSchema, type RelayContent } from "./schema";
import { RelayLayout } from "./layout";

export { RelayLayout, RelayContentSchema, type RelayContent };

export const relayTemplate = createTemplate<RelayContent>({
  name: "relay",
  description: "Rizom product card — Relay",
  schema: RelayContentSchema,
  requiredPermission: "public",
  layout: { component: RelayLayout },
});
