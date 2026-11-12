import {
  createPrintableProvider,
  preferredSlug,
  type PrintableProviderFactory,
} from "@brains/media-page-composer";
import type { BlogPost } from "../schemas/blog-post";
import { blogPostSchema } from "../schemas/blog-post";
import {
  BLOG_PRINTABLE_ATTACHMENT_TYPE,
  BLOG_PRINTABLE_TEMPLATE_NAME,
  type BlogPrintableTemplateInput,
} from "./printable-template";

export const createBlogPrintableProvider: PrintableProviderFactory =
  createPrintableProvider<BlogPost, BlogPrintableTemplateInput>({
    sourceEntityType: "post",
    entitySchema: blogPostSchema,
    attachmentType: BLOG_PRINTABLE_ATTACHMENT_TYPE,
    templateName: BLOG_PRINTABLE_TEMPLATE_NAME,
    themeMode: "light",
    buildContent: async (post, helpers) => {
      // A declared post reads back as its body, its frontmatter its metadata.
      const parsed = post.metadata;
      const content = post.content;
      const coverImageUrl = await helpers.resolveImageDataUrl(
        parsed.coverImageId,
      );

      return {
        title: parsed.title,
        body: content,
        ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
        ...(parsed.author ? { author: parsed.author } : {}),
        ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
        ...(parsed.canonicalUrl ? { canonicalUrl: parsed.canonicalUrl } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(helpers.brandLabel ? { brandLabel: helpers.brandLabel } : {}),
      };
    },
    pageTitle: (content) => content.title,
    slug: (post) => preferredSlug(post.metadata.slug, post.metadata.title),
  });
