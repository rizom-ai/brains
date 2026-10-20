import {
  createPrintableProvider,
  preferredSlug,
  type PrintableProviderFactory,
} from "@brains/media-page-composer";
import { parseMarkdown } from "@brains/utils/markdown";
import type { BlogPost } from "../schemas/blog-post";
import {
  blogPostFrontmatterSchema,
  blogPostSchema,
} from "../schemas/blog-post";
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
      const { frontmatter, content } = parseMarkdown(post.content);
      const parsed = blogPostFrontmatterSchema.parse(frontmatter);
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
