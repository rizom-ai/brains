import type { CloudflareConfig } from "../config";

/**
 * Cloudflare Web Analytics GraphQL response
 */
export interface CloudflareAnalyticsResponse {
  data: {
    viewer: {
      accounts: Array<{
        rumPageloadEventsAdaptiveGroups: Array<{
          count: number;
          sum: {
            visits: number;
          };
          dimensions: {
            date: string;
          };
        }>;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Options for fetching website stats
 */
export interface GetWebsiteStatsOptions {
  startDate: string;
  endDate: string;
}

/**
 * Aggregated website statistics
 */
export interface WebsiteStats {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totalTime: number;
}

/**
 * Cloudflare Web Analytics API client
 *
 * Fetches website analytics data from Cloudflare GraphQL API.
 * Privacy-focused, no cookies, GDPR compliant.
 *
 * @see https://developers.cloudflare.com/analytics/graphql-api/
 */
export class CloudflareClient {
  private readonly graphqlUrl = "https://api.cloudflare.com/client/v4/graphql";

  constructor(private config: CloudflareConfig) {}

  /**
   * Get aggregated website statistics for a date range
   */
  async getWebsiteStats(
    options: GetWebsiteStatsOptions,
  ): Promise<WebsiteStats> {
    const query = `
      query GetWebAnalytics($accountTag: String!, $siteTag: String!, $start: Date!, $end: Date!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { datetime_geq: $start }
                  { datetime_leq: $end }
                  { siteTag: $siteTag }
                ]
              }
              limit: 1000
            ) {
              count
              sum {
                visits
              }
              dimensions {
                date
              }
            }
          }
        }
      }
    `;

    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate,
      end: options.endDate,
    };

    const response = await fetch(this.graphqlUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API error: ${response.status} - ${errorText}`,
      );
    }

    const result = (await response.json()) as CloudflareAnalyticsResponse;

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Cloudflare GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    // Aggregate the results
    const groups =
      result.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];

    let pageviews = 0;
    let visits = 0;

    for (const group of groups) {
      pageviews += group.count;
      visits += group.sum?.visits ?? 0;
    }

    // Cloudflare Web Analytics doesn't provide these directly
    // They would need to be computed from more detailed queries
    return {
      pageviews,
      visitors: visits, // Cloudflare uses "visits" which approximates unique visitors
      visits,
      bounces: 0,
      totalTime: 0,
    };
  }

  /**
   * Validate that the API credentials are working
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const query = `
        query ValidateCredentials($accountTag: String!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              accountTag
            }
          }
        }
      `;

      const response = await fetch(this.graphqlUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { accountTag: this.config.accountId },
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = (await response.json()) as {
        errors?: Array<{ message: string }>;
      };
      return !result.errors || result.errors.length === 0;
    } catch {
      return false;
    }
  }
}
