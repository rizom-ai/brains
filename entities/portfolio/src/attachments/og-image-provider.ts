import type { AttachmentProvider, EntityPluginContext } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  renderOgImagePng,
  type ScreenshotPng,
} from "@brains/media-page-composer";
import { parseMarkdown, slugify } from "@brains/utils";
import type { Project } from "../schemas/project";
import { projectFrontmatterSchema } from "../schemas/project";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  projectOgImageTemplate,
  type ProjectOgImageTemplateData,
} from "./og-image-template";

export interface ProjectOgImageAttachmentProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export class ProjectOgImageAttachmentProvider implements AttachmentProvider {
  readonly metadata = {
    outputEntityType: "image",
    targetField: "ogImageId",
  } as const;

  private readonly context: Pick<
    EntityPluginContext,
    "entityService" | "themeCSS" | "identity" | "domain"
  >;
  private readonly deps: ProjectOgImageAttachmentProviderDeps;
  constructor(
    context: Pick<
      EntityPluginContext,
      "entityService" | "themeCSS" | "identity" | "domain"
    >,
    deps: ProjectOgImageAttachmentProviderDeps = {},
  ) {
    this.context = context;
    this.deps = deps;
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

    const { frontmatter } = parseMarkdown(project.content);
    const parsed = projectFrontmatterSchema.parse(frontmatter);
    const brandLabel = this.resolveBrandLabel();
    const coverImageUrl = await this.resolveCoverImageUrl(parsed.coverImageId);
    const content: ProjectOgImageTemplateData = {
      title: parsed.title,
      ...(parsed.description ? { description: parsed.description } : {}),
      year: parsed.year,
      ...(coverImageUrl ? { coverImageUrl } : {}),
      ...(brandLabel ? { brandLabel } : {}),
    };

    const png = await renderOgImagePng({
      mediaPath: `/_media/og/project/${project.id}`,
      template: projectOgImageTemplate,
      content,
      title: content.title,
      themeMode: "light",
      themeCSS: this.context.themeCSS,
      tmpPrefix: "brain-project-og-image-",
      ...(this.deps.screenshotPng && {
        screenshotPng: this.deps.screenshotPng,
      }),
    });

    return {
      type: "image",
      data: png,
      mimeType: "image/png",
      filename: `${getProjectSlug(project)}-og.png`,
    };
  }

  private resolveBrandLabel(): string | undefined {
    const domain = this.context.domain?.trim();
    if (domain && domain.length > 0) return domain;

    const name = this.context.identity.getProfile().name.trim();
    return name.length > 0 ? name : undefined;
  }

  private async resolveCoverImageUrl(
    coverImageId: string | undefined,
  ): Promise<string | undefined> {
    if (!coverImageId) return undefined;
    const image = await this.context.entityService.getEntity({
      entityType: "image",
      id: coverImageId,
    });
    return image?.content.startsWith("data:image/") ? image.content : undefined;
  }
}

function getProjectSlug(project: Project): string {
  const metadataSlug = project.metadata.slug;
  return metadataSlug.length > 0
    ? metadataSlug
    : slugify(project.metadata.title);
}
