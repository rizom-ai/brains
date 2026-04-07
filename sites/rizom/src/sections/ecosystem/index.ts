import { createTemplate } from "@brains/templates";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";
import { EcosystemLayout } from "./layout";
import { EcosystemFormatter } from "./formatter";

export {
  EcosystemLayout,
  EcosystemContentSchema,
  EcosystemFormatter,
  type EcosystemContent,
};

export const ecosystemTemplate = createTemplate<EcosystemContent>({
  name: "ecosystem",
  description: "Rizom ecosystem section — 3-card grid of sibling rizom sites",
  schema: EcosystemContentSchema,
  formatter: new EcosystemFormatter(),
  requiredPermission: "public",
  layout: { component: EcosystemLayout },
});
