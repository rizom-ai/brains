import { StructuredContentFormatter } from "@brains/utils";
import { projectContentSchema, type ProjectContent } from "../schemas/project";

/**
 * Formatter for the project body content.
 * Converts between structured ProjectContent data and markdown sections.
 *
 * Project bodies use structured content (## headings) for case study sections
 * (context, problem, solution, outcome). Only identity + metadata stays in frontmatter.
 */
export class ProjectBodyFormatter extends StructuredContentFormatter<ProjectContent> {
  constructor() {
    super(projectContentSchema, {
      title: "Project",
      mappings: [
        { key: "context", label: "Context", type: "string" },
        { key: "problem", label: "Problem", type: "string" },
        { key: "solution", label: "Solution", type: "string" },
        { key: "outcome", label: "Outcome", type: "string" },
      ],
    });
  }
}
