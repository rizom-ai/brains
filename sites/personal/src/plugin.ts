import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { enrichedBlogPostSchema } from "@brains/blog";
import { siteInfoCTASchema } from "@brains/site-info";
import { personalProfileSchema, personalProfileExtension } from "./schemas";
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
        .default({}),
    })
    .default({}),
});

type PersonalSiteConfig = z.infer<typeof personalSiteConfigSchema>;

export type PersonalSiteConfigInput = Partial<PersonalSiteConfig>;

/**
 * Personal Site Plugin
 * Simple blog-focused homepage — no decks, no portfolio dependencies
 */
export class PersonalSitePlugin extends ServicePlugin<PersonalSiteConfig> {
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
      posts: z.array(enrichedBlogPostSchema),
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
