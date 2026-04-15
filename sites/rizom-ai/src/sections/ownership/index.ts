import { createTemplate } from "@brains/templates";
import { OwnershipContentSchema, type OwnershipContent } from "./schema";
import { OwnershipLayout } from "./layout";
import { ownershipFormatter } from "./formatter";

export const ownershipTemplate = createTemplate<OwnershipContent>({
  name: "ownership",
  description:
    "Rizom ownership section — feature rows under a badge + headline",
  schema: OwnershipContentSchema,
  formatter: ownershipFormatter,
  requiredPermission: "public",
  layout: { component: OwnershipLayout },
});
