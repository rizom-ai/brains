import { createTemplate } from "@brains/templates";
import { ProblemContentSchema, type ProblemContent } from "./schema";
import { ProblemLayout } from "./layout";
import { problemFormatter } from "./formatter";

export const problemTemplate = createTemplate<ProblemContent>({
  name: "problem",
  description: "Rizom problem section — 3-up grid of problem statements",
  schema: ProblemContentSchema,
  formatter: problemFormatter,
  requiredPermission: "public",
  layout: { component: ProblemLayout },
});
