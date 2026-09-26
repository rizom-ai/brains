import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/sdk/entities";
import type { BlogPost } from "../schemas/blog-post";
import {
  blogPostFrontmatterSchema,
  blogPostSchema,
} from "../schemas/blog-post";
import {
  BLOG_OG_IMAGE_ATTACHMENT_TYPE,
  blogOgImageTemplate,
  type BlogOgImageTemplateData,
} from "./og-image-template";

export { BLOG_OG_IMAGE_ATTACHMENT_TYPE };

export const createBlogOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<BlogPost, BlogOgImageTemplateData>({
    sourceEntityType: "post",
    entitySchema: blogPostSchema,
    attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
    template: blogOgImageTemplate,
    themeMode: "light",
    buildContent: async (post, helpers) => {
      const { frontmatter } = parseMarkdown(post.content);
      const parsed = blogPostFrontmatterSchema.parse(frontmatter);
      const coverImageUrl = await helpers.resolveImageDataUrl(
        parsed.coverImageId,
      );

      return {
        title: parsed.title,
        ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
        ...(parsed.author ? { author: parsed.author } : {}),
        ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.title,
    slug: (post) => preferredSlug(post.metadata.slug, post.metadata.title),
  });
