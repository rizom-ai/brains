import type {
  AttachmentProvider,
  AttachmentProviderMetadata,
  AttachmentResolveRequest,
  BaseEntity,
  EntityPluginContext,
} from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import {
  createDataUrl,
  isAssetImageContent,
  resolveImageBytes,
  tryParseDataUrl,
  type Image,
} from "@brains/image";
import { slugify } from "@brains/utils/string-utils";
import { renderOgImagePng, type ScreenshotPng } from "./og-image";
import { renderPrintablePdf, type RenderPdf } from "./printable";
import type { MediaPageTemplate } from "./types";

/** The slice of the entity plugin context media attachment providers need. */
export type MediaAttachmentContext = Pick<
  EntityPluginContext,
  "entityService" | "assets" | "themeCSS" | "identity" | "domain"
>;

/** Context-derived values every template content builder ends up needing. */
export interface MediaContentHelpers {
  /**
   * Publisher label for the rendered artwork: the configured domain, else the
   * identity profile name, else undefined when both are blank.
   */
  brandLabel: string | undefined;
  /**
   * Data URL for a referenced image entity. Resolves to undefined when the id
   * is unset, the entity is missing, or its content is not inline image data.
   */
  resolveImageDataUrl(imageId: string | undefined): Promise<string | undefined>;
}

export interface MediaAttachmentProviderConfig<
  TEntity extends BaseEntity,
  TContent,
> {
  /** Entity type this provider derives its artifact from, e.g. `post`. */
  sourceEntityType: string;
  /** Semantic attachment type this provider answers to. */
  attachmentType: string;
  template: MediaPageTemplate;
  /** Rendering theme; defaults to light. */
  themeMode?: "light" | "dark" | undefined;
  /** Build the template's content model from the resolved entity. */
  buildContent: (
    entity: TEntity,
    helpers: MediaContentHelpers,
  ) => Promise<TContent> | TContent;
  /** Title for the rendered page. */
  pageTitle: (content: TContent) => string;
  /** Slug the output filename is built from. */
  slug: (entity: TEntity) => string;
}

export interface OgImageProviderDeps {
  screenshotPng?: ScreenshotPng;
}

export interface PrintableProviderDeps {
  renderPdf?: RenderPdf;
}

export type OgImageProviderFactory = (
  context: MediaAttachmentContext,
  deps?: OgImageProviderDeps,
) => AttachmentProvider;

export type PrintableProviderFactory = (
  context: MediaAttachmentContext,
  deps?: PrintableProviderDeps,
) => AttachmentProvider;

/** Prefer an explicit slug, falling back to a slugified title. */
export function preferredSlug(slug: string, title: string): string {
  return slug.length > 0 ? slug : slugify(title);
}

/** Build the shared content helpers for a media attachment context. */
export function createMediaContentHelpers(
  context: MediaAttachmentContext,
): MediaContentHelpers {
  return {
    brandLabel: resolveBrandLabel(context),
    resolveImageDataUrl: async (
      imageId: string | undefined,
    ): Promise<string | undefined> => {
      if (!imageId) return undefined;
      const image = await context.entityService.getEntity<Image>({
        entityType: "image",
        id: imageId,
        binaryContent: "reference",
        binaryContentSurface: "media-page-composer",
      });
      if (!image?.content) return undefined;
      if (
        !isAssetImageContent(image.content) &&
        !tryParseDataUrl(image.content)
      ) {
        return undefined;
      }
      const resolved = await resolveImageBytes(image, context.assets);
      return createDataUrl(
        Buffer.from(
          resolved.bytes.buffer,
          resolved.bytes.byteOffset,
          resolved.bytes.byteLength,
        ).toString("base64"),
        resolved.format,
      );
    },
  };
}

function resolveBrandLabel(
  context: MediaAttachmentContext,
): string | undefined {
  const domain = context.domain?.trim();
  if (domain && domain.length > 0) return domain;

  const name = context.identity.getProfile().name.trim();
  return name.length > 0 ? name : undefined;
}

/**
 * Every media attachment provider follows the same shape: match the request,
 * load the source entity, build the template content from it, render the page,
 * and wrap the bytes as publish media. Only the render step and the output
 * envelope differ, so those are the two parameters here.
 */
function createMediaAttachmentProvider<
  TEntity extends BaseEntity,
  TContent,
  TDeps,
>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
  output: {
    metadata: AttachmentProviderMetadata;
    /** Media route segment, e.g. `og` in `/_media/og/post/<id>`. */
    routeSegment: string;
    /** Filename suffix, e.g. `-og.png`. */
    filenameSuffix: string;
    /** Wrap the rendered bytes; keeps `type`/`mimeType` correlated. */
    envelope: (data: Buffer, filename: string) => PublishMediaData;
    render: (
      renderOptions: {
        mediaPath: string;
        template: MediaPageTemplate;
        content: unknown;
        title: string;
        themeMode: "light" | "dark" | undefined;
        themeCSS: string;
        tmpPrefix: string;
      },
      deps: TDeps | undefined,
    ) => Promise<Buffer>;
  },
): (context: MediaAttachmentContext, deps?: TDeps) => AttachmentProvider {
  return (context, deps): AttachmentProvider => ({
    metadata: output.metadata,
    resolve: async (
      request: AttachmentResolveRequest,
    ): Promise<PublishMediaData | undefined> => {
      if (
        request.sourceEntityType !== config.sourceEntityType ||
        request.attachmentType !== config.attachmentType
      ) {
        return undefined;
      }

      const entity = await context.entityService.getEntity<TEntity>({
        entityType: config.sourceEntityType,
        id: request.sourceEntityId,
      });
      if (!entity) return undefined;

      const content = await config.buildContent(
        entity,
        createMediaContentHelpers(context),
      );

      const data = await output.render(
        {
          mediaPath: `/_media/${output.routeSegment}/${config.sourceEntityType}/${entity.id}`,
          template: config.template,
          content,
          title: config.pageTitle(content),
          themeMode: config.themeMode,
          themeCSS: context.themeCSS,
          tmpPrefix: `brain-${config.sourceEntityType}-${output.routeSegment}-`,
        },
        deps,
      );

      return output.envelope(
        data,
        `${config.slug(entity)}${output.filenameSuffix}`,
      );
    },
  });
}

/**
 * Build an attachment provider that renders a source entity to a 1200×630 PNG
 * Open Graph image.
 */
export function createOgImageProvider<TEntity extends BaseEntity, TContent>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
): OgImageProviderFactory {
  return createMediaAttachmentProvider<TEntity, TContent, OgImageProviderDeps>(
    config,
    {
      metadata: { outputEntityType: "image", targetField: "ogImageId" },
      routeSegment: "og",
      filenameSuffix: "-og.png",
      envelope: (data, filename) => ({
        type: "image",
        data,
        mimeType: "image/png",
        filename,
      }),
      render: (renderOptions, deps) =>
        renderOgImagePng({
          ...renderOptions,
          ...(deps?.screenshotPng ? { screenshotPng: deps.screenshotPng } : {}),
        }),
    },
  );
}

/**
 * Build an attachment provider that renders a source entity to a printable PDF.
 */
export function createPrintableProvider<TEntity extends BaseEntity, TContent>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
): PrintableProviderFactory {
  return createMediaAttachmentProvider<
    TEntity,
    TContent,
    PrintableProviderDeps
  >(config, {
    metadata: { outputEntityType: "document" },
    routeSegment: "printable",
    filenameSuffix: "-printable.pdf",
    envelope: (data, filename) => ({
      type: "document",
      data,
      mimeType: "application/pdf",
      filename,
    }),
    render: (renderOptions, deps) =>
      renderPrintablePdf({
        ...renderOptions,
        ...(deps?.renderPdf ? { renderPdf: deps.renderPdf } : {}),
      }),
  });
}
