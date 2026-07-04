import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { createTemplate } from "@brains/templates";
import { HomepageListDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import {
  SubscribeThanksLayout,
  SubscribeErrorLayout,
} from "./templates/subscribe-result";
import {
  type ProfessionalSiteConfig,
  type ProfessionalSiteConfigInput,
  professionalSiteConfigSchema,
} from "./config";
import packageJson from "../package.json";

const homepageSectionSchema = z.object({
  blurb: z
    .string()
    .optional()
    .describe("Short italic subtitle under the section title"),
});

const siteInfoCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
});

const professionalProfileSchema = z.looseObject({
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
  role: z.string().optional(),
  audience: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  currentFocus: z.string().optional(),
  availability: z.string().optional(),
  desiredTone: z.string().optional(),
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

const deckSchema = z.looseObject({
  id: z.string(),
  entityType: z.literal("deck"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  contentHash: z.string(),
  metadata: z.looseObject({
    title: z.string(),
    publishedAt: z.string().optional(),
  }),
  frontmatter: z.looseObject({
    title: z.string(),
    description: z.string().optional(),
    publishedAt: z.string().optional(),
  }),
  body: z.string(),
  url: z.string().optional(),
  typeLabel: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

/**
 * Professional Site Plugin
 * Provides homepage template and datasource for professional brain
 */
export class ProfessionalSitePlugin extends ServicePlugin<
  ProfessionalSiteConfig,
  ProfessionalSiteConfigInput
> {
  public readonly dependencies: string[] = ["blog", "decks"];

  constructor(config: ProfessionalSiteConfigInput) {
    super(
      "professional-site",
      packageJson,
      config,
      professionalSiteConfigSchema,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Compute entity list URLs from config
    const postsConfig = this.config.entityDisplay.post;
    const decksConfig = this.config.entityDisplay.deck;

    const postsListUrl = `/${postsConfig.pluralName ?? postsConfig.label.toLowerCase() + "s"}`;
    const decksListUrl = `/${decksConfig.pluralName ?? decksConfig.label.toLowerCase() + "s"}`;

    // Register homepage datasource
    const homepageDataSource = new HomepageListDataSource(
      postsListUrl,
      decksListUrl,
    );
    context.entities.registerDataSource(homepageDataSource);

    // Register about page datasource
    const aboutDataSource = new AboutDataSource();
    context.entities.registerDataSource(aboutDataSource);

    // Register homepage template
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering
    const homepageListSchema = z.object({
      profile: professionalProfileSchema,
      posts: z.array(blogPostSchema),
      decks: z.array(deckSchema),
      postsListUrl: z.string(),
      decksListUrl: z.string(),
      cta: siteInfoCTASchema,
      sections: z.record(z.string(), homepageSectionSchema),
    });

    // About page schema
    const aboutPageSchema = z.object({
      profile: professionalProfileSchema,
    });

    // Empty schema for static pages
    const emptySchema = z.object({});

    context.templates.register({
      "homepage-list": createTemplate<
        z.infer<typeof homepageListSchema>,
        HomepageListData
      >({
        name: "homepage-list",
        description: "Professional homepage with essays and presentations",
        schema: homepageListSchema,
        dataSourceId: "professional:homepage-list",
        requiredPermission: "public",
        layout: {
          component: HomepageListLayout,
        },
      }),
      about: createTemplate<z.infer<typeof aboutPageSchema>, AboutPageData>({
        name: "about",
        description: "About page with full profile information",
        schema: aboutPageSchema,
        dataSourceId: "professional:about",
        requiredPermission: "public",
        layout: {
          component: AboutPageLayout,
        },
      }),
      "subscribe-thanks": createTemplate<
        z.infer<typeof emptySchema>,
        Record<string, never>
      >({
        name: "subscribe-thanks",
        description: "Newsletter subscription success page",
        schema: emptySchema,
        requiredPermission: "public",
        layout: {
          component: SubscribeThanksLayout,
        },
      }),
      "subscribe-error": createTemplate<
        z.infer<typeof emptySchema>,
        Record<string, never>
      >({
        name: "subscribe-error",
        description: "Newsletter subscription error page",
        schema: emptySchema,
        requiredPermission: "public",
        layout: {
          component: SubscribeErrorLayout,
        },
      }),
    });

    this.logger.info("Professional site plugin registered successfully");
  }

  /**
   * No tools needed for this plugin
   */
  protected override async getTools(): Promise<Tool[]> {
    return [];
  }

  /**
   * No resources needed for this plugin
   */
  protected override async getResources(): Promise<Resource[]> {
    return [];
  }
}

/**
 * Factory function to create the plugin
 */
export function professionalSitePlugin(
  config?: ProfessionalSiteConfigInput,
): Plugin {
  return new ProfessionalSitePlugin(config ?? {});
}
