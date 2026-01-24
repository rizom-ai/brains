import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool, toolSuccess, toolError } from "@brains/plugins";
import { z, toISODateString, getYesterday } from "@brains/utils";
import { CloudflareClient } from "../lib/cloudflare-client";
import { LinkedInAnalyticsClient } from "../lib/linkedin-analytics";
import type { CloudflareConfig, LinkedinAnalyticsConfig } from "../config";
import { createWebsiteMetricsEntity } from "../schemas/website-metrics";
import type { WebsiteMetricsEntity } from "../schemas/website-metrics";
import { createSocialMetricsEntity } from "../schemas/social-metrics";
import type { SocialMetricsEntity } from "../schemas/social-metrics";

// Schema for fetch_website tool parameters
const fetchWebsiteParamsSchema = z.object({
  date: z
    .string()
    .describe("Date in YYYY-MM-DD format (defaults to yesterday)")
    .optional(),
});

// Schema for get_website_trends tool parameters
const getWebsiteTrendsParamsSchema = z.object({
  limit: z.number().describe("Maximum number of results").default(30),
});

// Schema for fetch_social tool parameters
const fetchSocialParamsSchema = z.object({
  postId: z
    .string()
    .optional()
    .describe(
      "Specific social-post entity ID to fetch (fetches all published if omitted)",
    ),
});

// Schema for get_social_summary tool parameters
const getSocialSummaryParamsSchema = z.object({
  limit: z.number().describe("Maximum number of results").default(20),
});

/**
 * Interface for social post entity (soft dependency on social-media plugin)
 * Includes only the fields we need from social-post entities
 */
interface SocialPostWithFrontmatter {
  id: string;
  entityType: string;
  content: string;
  created: string;
  updated: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  frontmatter?: {
    platformPostId?: string;
    status?: string;
  };
}

/**
 * Create analytics plugin tools
 */
export function createAnalyticsTools(
  pluginId: string,
  context: ServicePluginContext,
  cloudflareConfig?: CloudflareConfig,
  linkedinConfig?: LinkedinAnalyticsConfig,
): PluginTool[] {
  const tools: PluginTool[] = [];

  // Only add Cloudflare tools if credentials are configured
  if (cloudflareConfig?.apiToken && cloudflareConfig.accountId) {
    const cloudflareClient = new CloudflareClient(cloudflareConfig);

    tools.push(
      createTypedTool(
        pluginId,
        "fetch_website",
        "Fetch website analytics from Cloudflare for a single day and store as metrics entity. Defaults to yesterday.",
        fetchWebsiteParamsSchema,
        async (input) => {
          // Date defaults to yesterday
          const date = input.date ?? toISODateString(getYesterday());

          try {
            // Fetch all data from Cloudflare in parallel
            const [stats, topPages, topReferrers, devices, topCountries] =
              await Promise.all([
                cloudflareClient.getWebsiteStats({
                  startDate: date,
                  endDate: date,
                }),
                cloudflareClient.getTopPages({
                  startDate: date,
                  endDate: date,
                  limit: 20,
                }),
                cloudflareClient.getTopReferrers({
                  startDate: date,
                  endDate: date,
                  limit: 20,
                }),
                cloudflareClient.getDeviceBreakdown({
                  startDate: date,
                  endDate: date,
                }),
                cloudflareClient.getTopCountries({
                  startDate: date,
                  endDate: date,
                  limit: 20,
                }),
              ]);

            // Create the metrics entity with all breakdowns
            const entity = createWebsiteMetricsEntity({
              date,
              pageviews: stats.pageviews,
              visitors: stats.visitors,
              topPages,
              topReferrers,
              devices,
              topCountries,
            });

            // Upsert the entity (update if exists, create if not)
            const result = await context.entityService.upsertEntity(entity);

            return toolSuccess(
              {
                entityId: result.entityId,
                date,
                pageviews: stats.pageviews,
                visitors: stats.visitors,
                topPagesCount: topPages.length,
                topReferrersCount: topReferrers.length,
                topCountriesCount: topCountries.length,
                devices,
                created: result.created,
              },
              `Website metrics ${result.created ? "created" : "updated"} for ${date}`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );

    tools.push(
      createTypedTool(
        pluginId,
        "get_website_trends",
        "Query stored daily website metrics to see trends over time.",
        getWebsiteTrendsParamsSchema,
        async (input) => {
          try {
            // Query stored metrics entities
            const entities =
              await context.entityService.listEntities<WebsiteMetricsEntity>(
                "website-metrics",
                {
                  limit: input.limit,
                  sortFields: [{ field: "created", direction: "desc" }],
                },
              );

            // Format for display
            const trends = entities.map((e) => ({
              id: e.id,
              date: e.metadata.date,
              pageviews: e.metadata.pageviews,
              visitors: e.metadata.visitors,
            }));

            return toolSuccess(
              { count: trends.length, trends },
              `Found ${trends.length} daily metrics records`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );
  }

  // Only add LinkedIn tools if access token is configured
  if (linkedinConfig?.accessToken) {
    const linkedinClient = new LinkedInAnalyticsClient(
      linkedinConfig.accessToken,
    );

    tools.push(
      createTypedTool(
        pluginId,
        "fetch_social",
        "Fetch engagement metrics for published LinkedIn posts and store as social-metrics entities.",
        fetchSocialParamsSchema,
        async (input) => {
          try {
            // Query social-post entities to find published posts
            let posts: SocialPostWithFrontmatter[];
            if (input.postId) {
              // Fetch specific post
              const post =
                await context.entityService.getEntity<SocialPostWithFrontmatter>(
                  "social-post",
                  input.postId,
                );
              posts = post ? [post] : [];
            } else {
              // Fetch all published posts
              posts =
                await context.entityService.listEntities<SocialPostWithFrontmatter>(
                  "social-post",
                  {
                    filter: { metadata: { status: "published" } },
                    limit: 100,
                  },
                );
            }

            if (posts.length === 0) {
              return toolSuccess(
                { fetched: 0, posts: [] },
                "No published social posts found",
              );
            }

            const results: Array<{
              entityId: string;
              postId: string;
              impressions: number;
              likes: number;
              comments: number;
              shares: number;
            }> = [];

            for (const post of posts) {
              const platformPostId = post.frontmatter?.platformPostId;
              if (!platformPostId) continue;

              // Fetch analytics from LinkedIn
              const analytics =
                await linkedinClient.getPostAnalytics(platformPostId);

              // Create/update metrics entity
              const entity = createSocialMetricsEntity({
                platform: "linkedin",
                entityId: post.id,
                platformPostId,
                impressions: analytics.impressions,
                likes: analytics.likes,
                comments: analytics.comments,
                shares: analytics.shares,
              });

              await context.entityService.upsertEntity(entity);

              results.push({
                entityId: entity.id,
                postId: post.id,
                impressions: analytics.impressions,
                likes: analytics.likes,
                comments: analytics.comments,
                shares: analytics.shares,
              });
            }

            return toolSuccess(
              { fetched: results.length, posts: results },
              `Fetched metrics for ${results.length} posts`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );

    tools.push(
      createTypedTool(
        pluginId,
        "get_social_summary",
        "Query stored social media metrics to see engagement across all posts.",
        getSocialSummaryParamsSchema,
        async (input) => {
          try {
            // Query stored social metrics entities
            const entities =
              await context.entityService.listEntities<SocialMetricsEntity>(
                "social-metrics",
                {
                  limit: input.limit,
                  sortFields: [{ field: "updated", direction: "desc" }],
                },
              );

            // Calculate totals
            let totalImpressions = 0;
            let totalLikes = 0;
            let totalComments = 0;
            let totalShares = 0;

            const posts = entities.map((e) => {
              totalImpressions += e.metadata.impressions;
              totalLikes += e.metadata.likes;
              totalComments += e.metadata.comments;
              totalShares += e.metadata.shares;

              return {
                id: e.id,
                entityId: e.metadata.entityId,
                platform: e.metadata.platform,
                snapshotDate: e.metadata.snapshotDate,
                impressions: e.metadata.impressions,
                likes: e.metadata.likes,
                comments: e.metadata.comments,
                shares: e.metadata.shares,
                engagementRate: e.metadata.engagementRate,
              };
            });

            const avgEngagementRate =
              totalImpressions > 0
                ? (totalLikes + totalComments + totalShares) / totalImpressions
                : 0;

            return toolSuccess(
              {
                count: posts.length,
                totals: {
                  impressions: totalImpressions,
                  likes: totalLikes,
                  comments: totalComments,
                  shares: totalShares,
                  avgEngagementRate,
                },
                posts,
              },
              `Found ${posts.length} posts with ${totalImpressions} total impressions`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return toolError(msg);
          }
        },
      ),
    );
  }

  return tools;
}
