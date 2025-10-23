export { AboutLayout } from "./layout";
export { AboutContentSchema, type AboutContent } from "./schema";
export { AboutFormatter } from "./formatter";

import { AboutContentSchema, type AboutContent } from "./schema";
import { AboutLayout } from "./layout";
import { AboutFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

export const aboutTemplate = createTemplate<AboutContent>({
  name: "about",
  description: "About page markdown content renderer",
  schema: AboutContentSchema,
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  formatter: new AboutFormatter(),
  layout: {
    component: AboutLayout,
    interactive: false,
  },
});
