import type {
  Plugin,
  Tool,
  Resource,
  ServicePluginContext,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { homepageOpeningSchema } from "./schemas/homepage-opening";
import { loadHomepageOpening } from "./datasources/homepage-opening";
import { loadHomepageAtlas } from "./datasources/homepage-atlas";
import { homepageChatAvailable } from "./datasources/homepage-chat";
import {
  HOMEPAGE_ATLAS_SCRIPT,
  HOMEPAGE_ATLAS_SCRIPT_PATH,
} from "./templates/homepage-atlas-script";
import { homepageAtlasSchema } from "./schemas/homepage-atlas";
import { blogViewSchema } from "@brains/blog";
import { deckViewSchema } from "@brains/decks";
import { aboutHighlightsSchema, professionalProfileSchema } from "./schemas";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod";
import { createTemplate } from "@brains/templates";
import { HomepageListDataSource } from "./datasources/homepage-datasource";
import { AboutDataSource } from "./datasources/about-datasource";
import {
  HomepageListLayout,
  type HomepageListData,
} from "./templates/homepage-list";
import { AboutPageLayout, type AboutPageData } from "./templates/about";
import { AboutHighlightsLayout } from "./templates/about-highlights";
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
    .nullable()
    .default(null)
    .describe("Short italic subtitle under the section title"),
});

const siteInfoCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
});

const blogPostSchema = blogViewSchema;
const deckSchema = deckViewSchema;

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
      this.config.homepageOpening
        ? {
            loadOpening: (
              buildContext,
            ): ReturnType<typeof loadHomepageOpening> =>
              loadHomepageOpening(buildContext, context),
            loadAtlas: (buildContext): ReturnType<typeof loadHomepageAtlas> =>
              loadHomepageAtlas({
                entityService: buildContext.entityService,
                semantic: {
                  project: (request) =>
                    buildContext.entityService.projectSemanticSpace(request),
                },
              }),
            chatAvailable: (buildContext): boolean =>
              homepageChatAvailable(buildContext, context),
          }
        : {},
    );
    context.entities.registerDataSource(homepageDataSource);

    // Register about page datasource
    const aboutDataSource = new AboutDataSource();
    context.entities.registerDataSource(aboutDataSource);

    // Register homepage template
    // Schema validates with optional url/typeLabel, site-builder enriches before rendering
    const homepageListSchema = z.object({
      profile: professionalProfileSchema,
      homepageOpening: z.boolean().default(false),
      opening: homepageOpeningSchema,
      atlas: homepageAtlasSchema,
      askBox: z.boolean().default(false),
      posts: z.array(blogPostSchema),
      decks: z.array(deckSchema),
      postsListUrl: z.string(),
      decksListUrl: z.string(),
      cta: siteInfoCTASchema,
      sections: z.record(z.string(), homepageSectionSchema),
    });

    const enrichedLinks = {
      url: z.string(),
      typeLabel: z.string(),
      listUrl: z.string(),
      listLabel: z.string(),
    };
    const homepageRenderSchema = homepageListSchema.extend({
      posts: z.array(blogPostSchema.extend(enrichedLinks)),
      decks: z.array(deckSchema.extend(enrichedLinks)),
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
        // Touch titles and motion pausing, shipped only to sites that opt into the atlas.
        ...(this.config.homepageOpening
          ? {
              runtimeScripts: [
                { src: HOMEPAGE_ATLAS_SCRIPT_PATH, defer: true },
              ],
              staticAssets: {
                [HOMEPAGE_ATLAS_SCRIPT_PATH]: HOMEPAGE_ATLAS_SCRIPT,
              },
            }
          : {}),
        layout: {
          component: HomepageListLayout,
          renderSchema: homepageRenderSchema,
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
      // The default site's one generated section. Knowledge-aware, so the
      // portrait is drawn from what the brain actually holds about its owner.
      "about-highlights": createTemplate<z.infer<typeof aboutHighlightsSchema>>(
        {
          name: "about-highlights",
          description: "Short generated portrait shown under the about page",
          schema: aboutHighlightsSchema,
          dataSourceId: "shell:ai-content",
          useKnowledgeContext: true,
          requiredPermission: "public",
          basePrompt: `Write a short professional portrait of the owner of this site, in the third person, from the knowledge available to you.

Be concrete: name the kind of work they do, the problems they return to, and how they approach them. Do not invent employers, credentials, dates, or achievements that the knowledge does not support. If the knowledge is thin, stay general rather than making things up.

The headline is one sentence of at most 90 characters. The summary is two or three sentences. The themes are two to five short phrases, three words or fewer each, naming recurring threads in their work.`,
          formatter: new StructuredContentFormatter(aboutHighlightsSchema, {
            title: "About highlights",
            mappings: [
              { key: "headline", label: "Headline", type: "string" },
              { key: "summary", label: "Summary", type: "string" },
              {
                key: "themes",
                label: "Themes",
                type: "array",
                itemType: "string",
              },
            ],
          }),
          layout: {
            component: AboutHighlightsLayout,
          },
        },
      ),
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
