import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import { renderPdf as defaultRenderPdf } from "@brains/media-renderer";
import type { PdfRenderOptions } from "@brains/media-renderer";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";
import type { Project } from "../schemas/project";
import { projectFrontmatterSchema } from "../schemas/project";
import {
  PROJECT_PRINTABLE_ATTACHMENT_TYPE,
  projectPrintableTemplate,
  type ProjectPrintableTemplateData,
} from "./printable-template";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface ProjectPrintableAttachmentProviderDeps {
  renderPdf?: RenderPdf;
}

export class ProjectPrintableAttachmentProvider implements AttachmentProvider {
  readonly metadata = { outputEntityType: "document" } as const;

  private readonly context: Pick<
    EntityPluginContext,
    "entityService" | "themeCSS" | "identity" | "domain"
  >;
  private readonly renderPdf: RenderPdf;

  constructor(
    context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: ProjectPrintableAttachmentProviderDeps = {},
  ) {
    this.context = context;
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "project" ||
      request.attachmentType !== PROJECT_PRINTABLE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const project = await this.context.entityService.getEntity<Project>({
      entityType: "project",
      id: request.sourceEntityId,
    });
    if (!project) return undefined;

    const printableContent = buildPrintableContent(project, {
      brandLabel: this.resolveBrandLabel(),
      coverImageUrl: await this.resolveCoverImageUrl(project),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-project-printable-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/printable/project/${project.id}`,
        template: projectPrintableTemplate,
        format: "pdf",
        content: printableContent,
        siteConfig: { title: printableContent.title, themeMode: "light" },
        themeCSS: this.context.themeCSS,
      });

      const server = await startStaticRenderServer({ rootDir: outputDir });
      try {
        const pdf = await this.renderPdf(server.urlFor(page.urlPath), {
          maxBytes: DEFAULT_MAX_BYTES,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          printBackground: true,
          preferCSSPageSize: true,
        });

        return {
          type: "document",
          data: pdf,
          mimeType: "application/pdf",
          filename: `${getProjectSlug(project)}-printable.pdf`,
        };
      } finally {
        await server.close();
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }

  private resolveBrandLabel(): string | undefined {
    const domain = this.context.domain?.trim();
    if (domain && domain.length > 0) return domain;

    const name = this.context.identity.getProfile().name.trim();
    return name.length > 0 ? name : undefined;
  }

  private async resolveCoverImageUrl(
    project: Project,
  ): Promise<string | undefined> {
    const { frontmatter } = parseMarkdown(project.content);
    const parsed = projectFrontmatterSchema.parse(frontmatter);
    if (!parsed.coverImageId) return undefined;

    const image = await this.context.entityService.getEntity({
      entityType: "image",
      id: parsed.coverImageId,
    });
    return image?.content.startsWith("data:image/") ? image.content : undefined;
  }
}

function buildPrintableContent(
  project: Project,
  options: {
    brandLabel?: string | undefined;
    coverImageUrl?: string | undefined;
  } = {},
): ProjectPrintableTemplateData {
  const { frontmatter, content } = parseMarkdown(project.content);
  const parsed = projectFrontmatterSchema.parse(frontmatter);
  return {
    title: parsed.title,
    body: content,
    ...(parsed.description ? { description: parsed.description } : {}),
    year: parsed.year,
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
    ...(parsed.url ? { url: parsed.url, canonicalUrl: parsed.url } : {}),
    ...(options.coverImageUrl ? { coverImageUrl: options.coverImageUrl } : {}),
    ...(options.brandLabel ? { brandLabel: options.brandLabel } : {}),
  };
}

function getProjectSlug(project: Project): string {
  const metadataSlug = project.metadata.slug;
  return metadataSlug.length > 0
    ? metadataSlug
    : slugify(project.metadata.title);
}
