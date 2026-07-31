import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { blogViewSchema } from "@brains/blog";
import { personalProfileSchema } from "./schemas";
import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/templates";
import { HomepageDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import { HomepageLayout, type HomepageData } from "./templates/homepage";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import packageJson from "../package.json";

interface PersonalSiteEntityDisplayItem {
  label: string;
  pluralName?: string | undefined;
}

interface PersonalSiteEntityDisplayItemInput {
  label?: string | undefined;
  pluralName?: string | undefined;
}

interface PersonalSiteConfig {
  entityDisplay: {
    post: PersonalSiteEntityDisplayItem;
  };
}

export interface PersonalSiteConfigInput {
  entityDisplay?:
    | {
        post?: PersonalSiteEntityDisplayItemInput | undefined;
      }
    | undefined;
}

const personalSiteConfigSchema: z.ZodType<
  PersonalSiteConfig,
  PersonalSiteConfigInput
> = z.object({
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
  subtitle: z.string().nullable().default(null),
});

const blogPostSchema = blogViewSchema;

/**
 * Personal Site Plugin
 * Simple blog-focused homepage — no decks, no portfolio dependencies
 */
export class PersonalSitePlugin extends ServicePlugin<
  PersonalSiteConfig,
  PersonalSiteConfigInput
> {
  public readonly dependencies: string[] = ["blog"];

  constructor(config: PersonalSiteConfigInput = {}) {
    super("personal-site", packageJson, config, personalSiteConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
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
