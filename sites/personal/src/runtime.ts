import { blogViewSchema } from "@brains/blog";
import type { SiteRuntimeDeclaration } from "@brains/sdk/internal/site-runtime";
import { personalProfileSchema } from "./schemas";
import { z } from "@brains/utils/zod";
import {
  createTemplate,
  renderedLinkFields,
} from "@brains/sdk/internal/site-runtime";
import { homepageDataSource } from "./datasources/homepage-datasource";
import { aboutDataSource } from "./datasources/about-datasource";
import { HomepageLayout, type HomepageData } from "./templates/homepage";
import { AboutPageLayout, type AboutPageData } from "./templates/about";

const personalSiteConfigSchema: z.ZodObject<{
  entityDisplay: z.ZodDefault<
    z.ZodObject<{
      post: z.ZodDefault<
        z.ZodObject<{
          label: z.ZodDefault<z.ZodString>;
          pluralName: z.ZodOptional<z.ZodString>;
        }>
      >;
    }>
  >;
}> = z.object({
  entityDisplay: z
    .object({
      post: z
        .object({
          label: z.string().default("Post"),
          pluralName: z.string().optional(),
        })
        .default({ label: "Post" }),
    })
    .default({ post: { label: "Post" } }),
});

export type PersonalSiteConfigInput = z.input<typeof personalSiteConfigSchema>;

const siteInfoCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
  subtitle: z.string().nullable().default(null),
});

const blogPostSchema = blogViewSchema;

// Homepage schema — blog posts only, no decks
const homepageSchema = z.object({
  profile: personalProfileSchema,
  posts: z.array(blogPostSchema),
  postsListUrl: z.string(),
  cta: siteInfoCTASchema,
});

// The homepage once site-builder has filled its posts' link fields.
const homepageRenderSchema = homepageSchema.extend({
  posts: z.array(blogPostSchema.extend(renderedLinkFields)),
});

const aboutPageSchema = z.object({
  profile: personalProfileSchema,
});

/**
 * What the personal site registers for the brain: a blog-focused homepage
 * and an about page, each drawn from its own data source.
 */
export const personalSiteRuntime: SiteRuntimeDeclaration<
  typeof personalSiteConfigSchema
> = {
  id: "personal-site",
  config: personalSiteConfigSchema,
  templates: {
    homepage: createTemplate<z.infer<typeof homepageSchema>, HomepageData>({
      name: "homepage",
      description: "Personal homepage with recent blog posts",
      schema: homepageSchema,
      dataSourceId: "personal-site:homepage",
      requiredPermission: "public",
      layout: {
        component: HomepageLayout,
        renderSchema: homepageRenderSchema,
      },
    }),
    about: createTemplate<z.infer<typeof aboutPageSchema>, AboutPageData>({
      name: "about",
      description: "About page with profile",
      schema: aboutPageSchema,
      dataSourceId: "personal-site:about",
      requiredPermission: "public",
      layout: {
        component: AboutPageLayout,
      },
    }),
  },
  dataSources: ({ config }) => {
    const postsConfig = config.entityDisplay.post;
    const postsListUrl = `/${postsConfig.pluralName ?? postsConfig.label.toLowerCase() + "s"}`;
    return [homepageDataSource(postsListUrl), aboutDataSource];
  },
};
