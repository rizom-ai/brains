import type { JSX } from "preact";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { markdownToHtml } from "@brains/utils";
import { BlogPostTemplate } from "./blog-post";
import { Head } from "@brains/ui-library";
import { templateBlogPostSchema } from "../schemas/blog-post";

/**
 * Homepage can show either the latest blog post or markdown content
 */
export const homepageSchema = z.union([
  // Blog post variant
  z.object({
    type: z.literal("post"),
    post: templateBlogPostSchema,
    prevPost: templateBlogPostSchema.nullable(),
    nextPost: templateBlogPostSchema.nullable(),
    seriesPosts: z.array(templateBlogPostSchema).nullable(),
  }),
  // Markdown content variant (for HOME.md)
  z.object({
    type: z.literal("markdown"),
    content: z.string(),
  }),
]);

export type HomepageContent = z.infer<typeof homepageSchema>;

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
  const htmlContent = markdownToHtml(props.content);

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

export const homepageTemplate = createTemplate({
  name: "homepage",
  description: "Homepage showing latest blog post or fallback content",
  schema: homepageSchema,
  dataSourceId: "blog:homepage",
  requiredPermission: "public",
  layout: {
    component: HomepageTemplate,
    interactive: false,
  },
});
