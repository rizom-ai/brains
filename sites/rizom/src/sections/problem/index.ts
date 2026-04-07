import { createTemplate } from "@brains/templates";
import { ProblemContentSchema, type ProblemContent } from "./schema";
import { ProblemLayout } from "./layout";

export { ProblemLayout, ProblemContentSchema, type ProblemContent };

export const problemTemplate = createTemplate<ProblemContent>({
  name: "problem",
  description: "Rizom problem section — 3-up grid of problem statements",
  schema: ProblemContentSchema,
  requiredPermission: "public",
  layout: {
    component: ProblemLayout,
  },
});
