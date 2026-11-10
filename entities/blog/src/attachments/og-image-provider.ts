import {
  createOgImageProvider,
  preferredSlug,
  type OgImageProviderFactory,
} from "@brains/media-page-composer";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostSchema } from "../schemas/blog-post";
import {
  BLOG_OG_IMAGE_ATTACHMENT_TYPE,
  BLOG_OG_IMAGE_TEMPLATE_NAME,
  type BlogOgImageTemplateInput,
} from "./og-image-template";

export const createBlogOgImageProvider: OgImageProviderFactory =
  createOgImageProvider<BlogPost, BlogOgImageTemplateInput>({
    sourceEntityType: "post",
    entitySchema: blogPostSchema,
    attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
    templateName: BLOG_OG_IMAGE_TEMPLATE_NAME,
    themeMode: "light",
    buildContent: async (post, helpers) => {
      // A declared post reads back as its body, its frontmatter its metadata.
      const parsed = post.metadata;
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
