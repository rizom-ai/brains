import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import type { Project } from "../schemas/project";
import { projectSchema } from "../schemas/project";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  PROJECT_OG_IMAGE_TEMPLATE_NAME,
  type ProjectOgImageTemplateInput,
} from "./og-image-template";

export const createProjectOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<Project, ProjectOgImageTemplateInput>({
    sourceEntityType: "project",
    entitySchema: projectSchema,
    attachmentType: PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
    templateName: PROJECT_OG_IMAGE_TEMPLATE_NAME,
    themeMode: "light",
    buildContent: async (project, helpers) => {
      // A project reads back as its body, its frontmatter its metadata.
      const parsed = project.metadata;
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
