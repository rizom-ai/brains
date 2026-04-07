import { createTemplate } from "@brains/templates";
import { OwnershipContentSchema, type OwnershipContent } from "./schema";
import { OwnershipLayout } from "./layout";
import { OwnershipFormatter } from "./formatter";

export {
  OwnershipLayout,
  OwnershipContentSchema,
  OwnershipFormatter,
  type OwnershipContent,
};

export const ownershipTemplate = createTemplate<OwnershipContent>({
  name: "ownership",
  description:
    "Rizom ownership section — feature rows under a badge + headline",
  schema: OwnershipContentSchema,
  formatter: new OwnershipFormatter(),
  requiredPermission: "public",
  layout: { component: OwnershipLayout },
});
