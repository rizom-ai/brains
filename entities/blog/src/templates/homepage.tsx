import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/plugins";
import { BlogPostTemplate } from "./blog-post";
import { Head, useMarkdownToHtml } from "@brains/ui-library";
import {
  blogViewSchema,
  type BlogPostView,
  type BlogSchemaData,
} from "./blog-view-schema";

export interface HomepagePostContent {
  type: "post";
  post: BlogPostView;
  prevPost: BlogPostView | null;
  nextPost: BlogPostView | null;
  seriesPosts: BlogPostView[] | null;
}

interface HomepagePostSchemaContent {
  type: "post";
  post: BlogSchemaData;
  prevPost: BlogSchemaData | null;
  nextPost: BlogSchemaData | null;
  seriesPosts: BlogSchemaData[] | null;
}

export interface HomepageMarkdownContent {
  type: "markdown";
  content: string;
}

export type HomepageContent = HomepagePostContent | HomepageMarkdownContent;
type HomepageSchemaContent =
  HomepagePostSchemaContent | HomepageMarkdownContent;

/**
 * Homepage can show either the latest blog post or markdown content
 */
export const homepageSchema: z.ZodType<HomepageSchemaContent> = z.union([
  // Blog post variant
  z.object({
    type: z.literal("post"),
    post: blogViewSchema,
    prevPost: blogViewSchema.nullable(),
    nextPost: blogViewSchema.nullable(),
    seriesPosts: z.array(blogViewSchema).nullable(),
  }),
  // Markdown content variant (for HOME.md)
  z.object({
    type: z.literal("markdown"),
    content: z.string(),
  }),
]);

/**
 * Homepage template - renders either blog post or markdown content
 */
export const HomepageTemplate = (props: HomepageContent): JSX.Element => {
  if (props.type === "post") {
    // Render as blog post
    return (
      <BlogPostTemplate
        post={props.post}
        prevPost={props.prevPost}
        nextPost={props.nextPost}
        seriesPosts={props.seriesPosts}
      />
    );
  }

  // Render markdown content
  const toHtml = useMarkdownToHtml();
  const htmlContent = toHtml(props.content);

  return (
    <>
      <Head title="Home" description="Welcome to my site" />
      <section className="homepage-section flex-grow min-h-screen">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl py-20">
          <article
            className="prose prose-lg dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      </section>
    </>
  );
};

export const homepageTemplate: ReturnType<
  typeof createTemplate<HomepageSchemaContent, HomepageContent>
> = createTemplate<HomepageSchemaContent, HomepageContent>({
  name: "homepage",
  description: "Homepage showing latest blog post or fallback content",
  schema: homepageSchema,
  dataSourceId: "latest",
  requiredPermission: "public",
  layout: {
    component: HomepageTemplate,
  },
});
