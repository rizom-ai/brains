import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import { screenshotPng as defaultScreenshotPng } from "@brains/media-renderer";
import type {
  ScreenshotPngOptions,
  ViewportOptions,
} from "@brains/media-renderer";
import {
  startStaticRenderServer,
  writeMediaRenderPage,
} from "@brains/media-page-composer";
import { parseMarkdown, slugify } from "@brains/utils";
import type { Project } from "../schemas/project";
import { projectFrontmatterSchema } from "../schemas/project";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  projectOgImageTemplate,
  type ProjectOgImageTemplateData,
} from "./og-image-template";

const OG_VIEWPORT: ViewportOptions = { width: 1200, height: 630 };
const DEFAULT_TIMEOUT_MS = 60_000;

export type ScreenshotPng = (
  url: string,
  viewport: ViewportOptions,
  options?: ScreenshotPngOptions,
) => Promise<Buffer>;

export interface ProjectOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class ProjectOgImageAttachmentProvider implements AttachmentProvider {
  private readonly screenshotPng: ScreenshotPng;

  constructor(
    private readonly context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: ProjectOgImageAttachmentProviderDeps = {},
  ) {
    this.screenshotPng = deps.screenshotPng ?? defaultScreenshotPng;
  }

  async resolve(request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }): Promise<PublishMediaData | undefined> {
    if (
      request.sourceEntityType !== "project" ||
      request.attachmentType !== PROJECT_OG_IMAGE_ATTACHMENT_TYPE
    ) {
      return undefined;
    }

    const project = await this.context.entityService.getEntity<Project>({
      entityType: "project",
      id: request.sourceEntityId,
    });
    if (!project) return undefined;

    const ogContent = buildOgImageContent(project, {
      brandLabel: this.resolveBrandLabel(),
      coverImageUrl: await this.resolveCoverImageUrl(project),
    });
    const outputDir = await mkdtemp(join(tmpdir(), "brain-project-og-image-"));

    try {
      const page = await writeMediaRenderPage({
        outputDir,
        mediaPath: `/_media/og/project/${project.id}`,
        template: projectOgImageTemplate,
        format: "image",
        content: ogContent,
        siteConfig: { title: ogContent.title, themeMode: "light" },
        themeCSS: this.context.themeCSS,
      });

      const server = await startStaticRenderServer({ rootDir: outputDir });
      try {
        const png = await this.screenshotPng(
          server.urlFor(page.urlPath),
          OG_VIEWPORT,
          {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            fullPage: false,
            omitBackground: false,
          },
        );

        return {
          type: "image",
          data: png,
          mimeType: "image/png",
          filename: `${getProjectSlug(project)}-og.png`,
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

function buildOgImageContent(
  project: Project,
  options: {
    brandLabel?: string | undefined;
    coverImageUrl?: string | undefined;
  } = {},
): ProjectOgImageTemplateData {
  const { frontmatter } = parseMarkdown(project.content);
  const parsed = projectFrontmatterSchema.parse(frontmatter);
  return {
    title: parsed.title,
    ...(parsed.description ? { description: parsed.description } : {}),
    year: parsed.year,
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
