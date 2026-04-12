import { createTemplate } from "@brains/templates";
import { WorkProblemContentSchema, type WorkProblemContent } from "./schema";
import { WorkProblemLayout } from "./layout";
import { workProblemFormatter } from "./formatter";

export const workProblemTemplate = createTemplate<WorkProblemContent>({
  name: "work-problem",
  description:
    "Rizom work problem section — editorial coordination problem statement",
  schema: WorkProblemContentSchema,
  formatter: workProblemFormatter,
  requiredPermission: "public",
  layout: { component: WorkProblemLayout },
});
