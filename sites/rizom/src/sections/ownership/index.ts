import { createTemplate } from "@brains/templates";
import { OwnershipContentSchema, type OwnershipContent } from "./schema";
import { OwnershipLayout } from "./layout";

export { OwnershipLayout, OwnershipContentSchema, type OwnershipContent };

export const ownershipTemplate = createTemplate<OwnershipContent>({
  name: "ownership",
  description: "Rizom ownership section — 3-row feature grid",
  schema: OwnershipContentSchema,
  requiredPermission: "public",
  layout: { component: OwnershipLayout },
});
