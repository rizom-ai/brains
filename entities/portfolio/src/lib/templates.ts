import { createTemplate, paginationInfoSchema } from "@brains/plugins";
import type { Template } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  projectViewSchema,
  type ProjectSchemaData,
} from "../templates/project-view";
import {
  ProjectListTemplate,
  type ProjectListProps,
} from "../templates/project-list";
import {
  ProjectDetailTemplate,
  type ProjectDetailProps,
} from "../templates/project-detail";
import { projectGenerationTemplate } from "../templates/generation-template";

const projectListSchema: z.ZodType<{
  projects: ProjectSchemaData[];
  pageTitle: string | null;
  pagination: z.output<typeof paginationInfoSchema> | null;
  baseUrl: string | null;
}> = z.object({
  projects: z.array(projectViewSchema),
  pageTitle: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const projectDetailSchema = z.object({
  project: projectViewSchema,
  prevProject: projectViewSchema.nullable(),
  nextProject: projectViewSchema.nullable(),
});

/**
 * Templates this entity renders. Data source ids are local; the runtime
 * scopes them to the package.
 */
export function getTemplates(): Record<string, Template> {
  return {
    "project-list": createTemplate<
      z.output<typeof projectListSchema>,
      ProjectListProps
    >({
      name: "project-list",
      description: "Portfolio project list page template",
      schema: projectListSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: { component: ProjectListTemplate },
    }),
    "project-detail": createTemplate<
      z.output<typeof projectDetailSchema>,
      ProjectDetailProps
    >({
      name: "project-detail",
      description: "Individual project case study template",
      schema: projectDetailSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: { component: ProjectDetailTemplate },
    }),
    generation: projectGenerationTemplate,
  };
}
