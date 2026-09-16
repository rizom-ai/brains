import type {
  FileAttachmentProvider,
  BaseEntity,
  EntityPluginContext,
  EntitySchema,
} from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import { createMediaFileProvider } from "./media-file-provider";
import type { MediaPageTemplate } from "./types";

/** The slice of the entity plugin context media attachment providers need. */
export type MediaAttachmentContext = Pick<
  EntityPluginContext,
  "entityService" | "themeCSS" | "identity" | "domain"
>;

/** Context-derived values every template content builder ends up needing. */
export interface MediaContentHelpers {
  /** Configured domain, else identity profile name, else undefined. */
  brandLabel: string | undefined;
  /** Scoped file URL. Missing/non-asset images are omitted; no data URL fallback. */
  resolveImageUrl(imageId: string | undefined): Promise<string | undefined>;
}

export type MediaThemeMode = "light" | "dark";

export interface MediaAttachmentProviderConfig<
  TEntity extends BaseEntity,
  TContent,
> {
  /** Entity type this provider derives its artifact from, e.g. `post`. */
  sourceEntityType: string;
  /** Schema for entities of `sourceEntityType`; lookups are parsed with it. */
  entitySchema: EntitySchema<TEntity>;
  /** Semantic attachment type this provider answers to. */
  attachmentType: string;
  template: MediaPageTemplate;
  /** Rendering theme; request-time resolution is joined before actor acquisition. */
  themeMode?: MediaThemeMode | (() => Promise<MediaThemeMode>) | undefined;
  /** Build the template's content model from the resolved entity. */
  buildContent: (
    entity: TEntity,
    helpers: MediaContentHelpers,
  ) => Promise<TContent> | TContent;
  /** Title for the rendered page. */
  pageTitle: (content: TContent) => string;
  /** Slug the output filename is built from. */
  slug: (entity: TEntity) => string;
  /** Override the default OG/printable attachment filename. */
  filename?: ((entity: TEntity) => string) | undefined;
}

export type OgImageProviderFactory = (
  context: MediaAttachmentContext,
) => FileAttachmentProvider;
export type PrintableProviderFactory = (
  context: MediaAttachmentContext,
) => FileAttachmentProvider;

/** Prefer an explicit slug, falling back to a slugified title. */
export function preferredSlug(slug: string, title: string): string {
  return slug.length > 0 ? slug : slugify(title);
}

export function resolveBrandLabel(
  context: MediaAttachmentContext,
): string | undefined {
  const domain = context.domain?.trim();
  if (domain && domain.length > 0) return domain;
  const name = context.identity.getProfile().name.trim();
  return name.length > 0 ? name : undefined;
}

/** Render a source entity to a scoped 1200×630 PNG using the provisioned actor. */
export function createOgImageProvider<TEntity extends BaseEntity, TContent>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
): OgImageProviderFactory {
  return (context): FileAttachmentProvider =>
    createMediaFileProvider(
      config,
      context,
      () => resolveBrandLabel(context),
      "image",
    );
}

/** Render a source entity to a scoped PDF using the same provisioned Bun actor. */
export function createPrintableProvider<TEntity extends BaseEntity, TContent>(
  config: MediaAttachmentProviderConfig<TEntity, TContent>,
): PrintableProviderFactory {
  return (context): FileAttachmentProvider =>
    createMediaFileProvider(
      config,
      context,
      () => resolveBrandLabel(context),
      "pdf",
    );
}
