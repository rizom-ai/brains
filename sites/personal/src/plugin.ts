import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { createTemplate } from "@brains/templates";
import { personalProfileExtension } from "./schemas";
import { HomepageDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import { HomepageLayout, type HomepageData } from "./templates/homepage";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import packageJson from "../package.json";

const personalSiteConfigSchema = z.object({
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

const siteInfoCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
  subtitle: z.string().optional(),
});

const personalProfileSchema = z.looseObject({
  name: z.string(),
  kind: z.enum(["professional", "team", "collective"]),
  organization: z.string().optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.enum([
          "github",
          "instagram",
          "linkedin",
          "email",
          "website",
        ]),
        url: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  tagline: z.string().optional(),
  intro: z.string().optional(),
  story: z.string().optional(),
});

const blogPostSchema = z.looseObject({
  id: z.string(),
  entityType: z.literal("post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  contentHash: z.string(),
  metadata: z.looseObject({
    title: z.string(),
    publishedAt: z.string().optional(),
  }),
  frontmatter: z.looseObject({
    excerpt: z.string(),
    seriesName: z.string().optional(),
    seriesIndex: z.number().optional(),
  }),
  body: z.string(),
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  seriesUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
  coverImageSrcset: z.string().optional(),
  coverImageSizes: z.string().optional(),
});

type PersonalSiteConfig = z.output<typeof personalSiteConfigSchema>;

export type PersonalSiteConfigInput = z.input<typeof personalSiteConfigSchema>;

/**
 * Personal Site Plugin
 * Simple blog-focused homepage — no decks, no portfolio dependencies
 */
export class PersonalSitePlugin extends ServicePlugin<
  PersonalSiteConfig,
  PersonalSiteConfigInput
> {
  public readonly dependencies = ["blog"];

  constructor(config: PersonalSiteConfigInput = {}) {
    super("personal-site", packageJson, config, personalSiteConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Extend profile schema with personal fields
    context.entities.extendFrontmatterSchema(
      "anchor-profile",
      personalProfileExtension,
    );

    const postsConfig = this.config.entityDisplay.post;
    const postsListUrl = `/${postsConfig.pluralName ?? postsConfig.label.toLowerCase() + "s"}`;

    // Register datasources
    const homepageDataSource = new HomepageDataSource(postsListUrl);
    context.entities.registerDataSource(homepageDataSource);

    const aboutDataSource = new AboutDataSource();
    context.entities.registerDataSource(aboutDataSource);

    // Homepage schema — blog posts only, no decks
    const homepageSchema = z.object({
      profile: personalProfileSchema,
      posts: z.array(blogPostSchema),
      postsListUrl: z.string(),
      cta: siteInfoCTASchema,
    });

    const aboutPageSchema = z.object({
      profile: personalProfileSchema,
    });

    context.templates.register({
      homepage: createTemplate<z.infer<typeof homepageSchema>, HomepageData>({
        name: "homepage",
        description: "Personal homepage with recent blog posts",
        schema: homepageSchema,
        dataSourceId: "personal:homepage",
        requiredPermission: "public",
        layout: {
          component: HomepageLayout,
        },
      }),
      about: createTemplate<z.infer<typeof aboutPageSchema>, AboutPageData>({
        name: "about",
        description: "About page with profile",
        schema: aboutPageSchema,
        dataSourceId: "personal:about",
        requiredPermission: "public",
        layout: {
          component: AboutPageLayout,
        },
      }),
    });

    this.logger.info("Personal site plugin registered successfully");
  }

  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

export function personalSitePlugin(config?: PersonalSiteConfigInput): Plugin {
  return new PersonalSitePlugin(config ?? {});
}
