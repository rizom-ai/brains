import { projectFrontmatterSchema } from "./schemas/project";
import { createTemplate } from "@brains/sdk/internal/presentation";
import { defineEntity, z, type EntityDefinition } from "@brains/sdk/entities";
import {
  restatingMetadata,
  withBodyTemplate,
  withFrontmatterSchema,
} from "@brains/sdk/internal/entity-runtime";
import { paginationInfoSchema } from "@brains/sdk/internal/presentation";
import { projectAtproto } from "./atproto-projection";
import { createProjectOgImageProvider } from "./attachments/og-image-provider";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  projectOgImageTemplate,
} from "./attachments/og-image-template";
import { createProjectPrintableProvider } from "./attachments/printable-provider";
import {
  PROJECT_PRINTABLE_ATTACHMENT_TYPE,
  projectPrintableTemplate,
} from "./attachments/printable-template";
import { projectGeneration } from "./handlers/generation-handler";
import { projectFromPrompt, projectFromText } from "./lib/create-from-text";
import { projectEvals } from "./lib/eval-handlers";
import { projectBodyTemplate, projectMarkdown } from "./lib/project-markdown";
import { projectMetadataSchema } from "./schemas/project";
import { projectFromTextTemplate } from "./templates/from-text-template";
import { projectGenerationTemplate } from "./templates/generation-template";
import {
  ProjectDetailTemplate,
  type ProjectDetailProps,
} from "./templates/project-detail";
import {
  ProjectListTemplate,
  type ProjectListProps,
} from "./templates/project-list";
import {
  projectRenderSchema,
  projectViewSchema,
} from "./templates/project-view";
import { internalPublishProvider } from "@brains/contracts";

/** The pages once site-builder has filled their projects' link fields. */
const projectListRenderSchema = z.object({
  projects: z.array(projectRenderSchema),
  pageTitle: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const projectDetailRenderSchema = z.object({
  project: projectRenderSchema,
  prevProject: projectRenderSchema.nullable(),
  nextProject: projectRenderSchema.nullable(),
});

const projectListSchema = z.object({
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
 * A portfolio project or case study: its sections in the body, its
 * frontmatter its metadata. It is written from the writer's text or
 * generated from a prompt naming the year it began, rendered on the site,
 * as a printable and a social card, published by the site itself, and as
 * an ai.rizom.brain.project record. Once stored, its file states its slug,
 * resolved or not, so later writes put it where a stated slug goes, as the
 * project adapter wrote it; the vault scaffolds a new project with its four
 * sections.
 */
export const project: EntityDefinition<
  "project",
  typeof projectMetadataSchema
> = withFrontmatterSchema(
  withBodyTemplate(
    restatingMetadata(
      defineEntity({
        type: "project",
        purpose: "A portfolio project or case study.",
        metadata: projectMetadataSchema,
        markdown: projectMarkdown,
        config: { projectionSourceRole: "secondary" },
        coverImage: true,
        stub: ({ id, title }) => ({
          content: "",
          metadata: {
            title,
            slug: id,
            authoredSlug: true,
            status: "generating",
            description: "",
            year: new Date().getUTCFullYear(),
          },
        }),
        templates: {
          "project-list": createTemplate<
            z.output<typeof projectListSchema>,
            ProjectListProps
          >({
            name: "project-list",
            description: "Portfolio project list page template",
            schema: projectListSchema,
            dataSourceId: "portfolio:entities",
            requiredPermission: "public",
            layout: {
              component: ProjectListTemplate,
              renderSchema: projectListRenderSchema,
            },
          }),
          "project-detail": createTemplate<
            z.output<typeof projectDetailSchema>,
            ProjectDetailProps
          >({
            name: "project-detail",
            description: "Individual project case study template",
            schema: projectDetailSchema,
            dataSourceId: "portfolio:entities",
            requiredPermission: "public",
            layout: {
              component: ProjectDetailTemplate,
              renderSchema: projectDetailRenderSchema,
            },
          }),
          generation: projectGenerationTemplate,
          "from-text": projectFromTextTemplate,
          "og-image": projectOgImageTemplate,
          "project-printable": projectPrintableTemplate,
        },
        create: { fromContent: projectFromText, fromPrompt: projectFromPrompt },
        generation: projectGeneration,
        attachments: [
          {
            type: PROJECT_PRINTABLE_ATTACHMENT_TYPE,
            provider: (context) => createProjectPrintableProvider(context),
          },
          {
            type: PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
            provider: (context) => createProjectOgImageProvider(context),
          },
        ],
        // Projects publish to the site itself, so the provider records the
        // outcome and nothing more.
        publish: {
          provider: internalPublishProvider,
        },
        atproto: projectAtproto,
        evals: projectEvals,
      }),
      (stored) => ({ ...stored, authoredSlug: true }),
    ),
    projectBodyTemplate,
  ),
  projectFrontmatterSchema,
);
