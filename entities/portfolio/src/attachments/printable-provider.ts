import {
  createPrintableProvider,
  preferredSlug,
  type PrintableProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import type { Project } from "../schemas/project";
import { projectFrontmatterSchema } from "../schemas/project";
import {
  PROJECT_PRINTABLE_ATTACHMENT_TYPE,
  projectPrintableTemplate,
  type ProjectPrintableTemplateData,
} from "./printable-template";

export const createProjectPrintableProvider: PrintableProviderFactory =
  createPrintableProvider<Project, ProjectPrintableTemplateData>({
    sourceEntityType: "project",
    attachmentType: PROJECT_PRINTABLE_ATTACHMENT_TYPE,
    template: projectPrintableTemplate,
    themeMode: "light",
    buildContent: async (project, helpers) => {
      const { frontmatter, content } = parseMarkdown(project.content);
      const parsed = projectFrontmatterSchema.parse(frontmatter);
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
