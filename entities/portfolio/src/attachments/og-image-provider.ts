import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import type { Project } from "../schemas/project";
import { projectFrontmatterSchema, projectSchema } from "../schemas/project";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  projectOgImageTemplate,
  type ProjectOgImageTemplateData,
} from "./og-image-template";

export const createProjectOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<Project, ProjectOgImageTemplateData>({
    sourceEntityType: "project",
    entitySchema: projectSchema,
    attachmentType: PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
    template: projectOgImageTemplate,
    themeMode: "light",
    buildContent: async (project, helpers) => {
      const { frontmatter } = parseMarkdown(project.content);
      const parsed = projectFrontmatterSchema.parse(frontmatter);
      const coverImageUrl = await helpers.resolveImageDataUrl(
        parsed.coverImageId,
      );

      return {
        title: parsed.title,
        ...(parsed.description ? { description: parsed.description } : {}),
        year: parsed.year,
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.title,
    slug: (project) =>
      preferredSlug(project.metadata.slug, project.metadata.title),
  });
