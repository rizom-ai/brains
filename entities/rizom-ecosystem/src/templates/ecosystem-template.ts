import { Ecosystem } from "../ui/Ecosystem";
import { createTemplate, type Template } from "@brains/plugins";
import { ecosystemContentSchema } from "../schemas/ecosystem-section";
import { formatEcosystemContent, parseEcosystemContent } from "../lib";

export const ecosystemTemplate: Template = createTemplate({
  name: "ecosystem",
  description: "Rizom ecosystem sibling-site section",
  schema: ecosystemContentSchema,
  formatter: {
    parse: parseEcosystemContent,
    format: formatEcosystemContent,
  },
  dataSourceId: "rizom-ecosystem:entities",
  requiredPermission: "public",
  layout: { component: Ecosystem },
});
