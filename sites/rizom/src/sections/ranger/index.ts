import { createTemplate } from "@brains/templates";
import { RangerContentSchema, type RangerContent } from "./schema";
import { RangerLayout } from "./layout";

export { RangerLayout, RangerContentSchema, type RangerContent };

export const rangerTemplate = createTemplate<RangerContent>({
  name: "ranger",
  description: "Rizom product card — Ranger",
  schema: RangerContentSchema,
  requiredPermission: "public",
  layout: { component: RangerLayout },
});
