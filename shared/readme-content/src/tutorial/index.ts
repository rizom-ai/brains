export { TutorialLayout } from "./layout";
export { PresentationLayout } from "./presentation-layout";
export { TutorialContentSchema, type TutorialContent } from "./schema";
export { TutorialFormatter } from "./formatter";

import { TutorialContentSchema, type TutorialContent } from "./schema";
import { TutorialLayout } from "./layout";
import { TutorialFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

export const readmeTemplate = createTemplate<TutorialContent>({
  name: "readme",
  description: "README markdown content renderer",
  schema: TutorialContentSchema,
  dataSourceId: "shell:entities",
  requiredPermission: "public",
  formatter: new TutorialFormatter(),
  layout: {
    component: TutorialLayout,
    interactive: false,
  },
});
