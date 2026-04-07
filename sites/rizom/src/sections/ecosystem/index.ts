import { createTemplate } from "@brains/templates";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";
import { EcosystemLayout } from "./layout";
import { ecosystemFormatter } from "./formatter";

export const ecosystemTemplate = createTemplate<EcosystemContent>({
  name: "ecosystem",
  description: "Rizom ecosystem section — 3-card grid of sibling rizom sites",
  schema: EcosystemContentSchema,
  formatter: ecosystemFormatter,
  requiredPermission: "public",
  layout: { component: EcosystemLayout },
});
