import {
  createPrintableProvider,
  preferredSlug,
  type PrintableProviderFactory,
} from "@brains/media-page-composer";
import type { Project } from "../schemas/project";
import { projectSchema } from "../schemas/project";
import {
  PROJECT_PRINTABLE_ATTACHMENT_TYPE,
  PROJECT_PRINTABLE_TEMPLATE_NAME,
  type ProjectPrintableTemplateInput,
} from "./printable-template";

export const createProjectPrintableProvider: PrintableProviderFactory =
  createPrintableProvider<Project, ProjectPrintableTemplateInput>({
    sourceEntityType: "project",
    entitySchema: projectSchema,
    attachmentType: PROJECT_PRINTABLE_ATTACHMENT_TYPE,
    templateName: PROJECT_PRINTABLE_TEMPLATE_NAME,
    themeMode: "light",
    buildContent: async (project, helpers) => {
      // A project reads back as its body, its frontmatter its metadata.
      const parsed = project.metadata;
      const content = project.content;
      const coverImageUrl = await helpers.resolveImageDataUrl(
        parsed.coverImageId,
      );

      return {
        title: parsed.title,
        body: content,
        ...(parsed.description ? { description: parsed.description } : {}),
        year: parsed.year,
        ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
        ...(parsed.url ? { url: parsed.url, canonicalUrl: parsed.url } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.title,
    slug: (project) =>
      preferredSlug(project.metadata.slug, project.metadata.title),
  });
