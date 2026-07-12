import type { CloudflareConfig } from "../config";

/**
 * Cloudflare Web Analytics GraphQL response envelope
 */
interface CloudflareGraphQLResponse<TGroup> {
  data: {
    viewer: {
      accounts: Array<{
        rumPageloadEventsAdaptiveGroups?: TGroup[];
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
 * Options for fetching dimension breakdowns
 */
export interface GetBreakdownOptions {
  startDate: string;
  endDate: string;
  limit?: number;
}

/**
 * Top page result
 */
export interface TopPageResult {
  path: string;
  views: number;
}

/**
 * Top referrer result
 */
export interface TopReferrerResult {
  host: string;
  visits: number;
}

/**
 * Device breakdown result
 */
export interface DeviceBreakdownResult {
  desktop: number;
  mobile: number;
  tablet: number;
}

/**
 * Top country result
 */
export interface TopCountryResult {
  country: string;
  visits: number;
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

  private config: CloudflareConfig;

  constructor(config: CloudflareConfig) {
    this.config = config;
  }

  /**
   * Execute a GraphQL query and return the adaptive groups from the
   * first account in the response.
   */
  private async queryGraphQL<TGroup>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TGroup[]> {
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

    const result = (await response.json()) as CloudflareGraphQLResponse<TGroup>;

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Cloudflare GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    return (
      result.data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? []
    );
  }

  /**
   * Build the common query variables, truncating dates to YYYY-MM-DD
   */
  private baseVariables(options: {
    startDate: string;
    endDate: string;
  }): Record<string, unknown> {
    return {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
    };
  }

  /**
   * Get aggregated website statistics for a date range
   */
  async getWebsiteStats(
    options: GetWebsiteStatsOptions,
  ): Promise<WebsiteStats> {
    const query = `
      query GetWebAnalytics($accountTag: String!, $siteTag: String!, $start: String!, $end: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { date_geq: $start }
                  { date_leq: $end }
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

    const groups = await this.queryGraphQL<{
      count: number;
      sum: { visits: number };
      dimensions: { date: string };
    }>(query, this.baseVariables(options));

    let pageviews = 0;
    let visits = 0;

    for (const group of groups) {
      pageviews += group.count;
      visits += group.sum.visits;
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
    const query = `
      query ValidateCredentials($accountTag: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            accountTag
          }
        }
      }
    `;

    try {
      await this.queryGraphQL(query, { accountTag: this.config.accountId });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get top pages by views for a date range
   */
  async getTopPages(options: GetBreakdownOptions): Promise<TopPageResult[]> {
    const query = `
      query GetTopPages($accountTag: String!, $siteTag: String!, $start: String!, $end: String!, $limit: Int!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { date_geq: $start }
                  { date_leq: $end }
                  { siteTag: $siteTag }
                ]
              }
              limit: $limit
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                requestPath
              }
            }
          }
        }
      }
    `;

    const groups = await this.queryGraphQL<{
      count: number;
      dimensions: { requestPath: string };
    }>(query, {
      ...this.baseVariables(options),
      limit: options.limit ?? 20,
    });

    return groups.map((g) => ({
      path: g.dimensions.requestPath,
      views: g.count,
    }));
  }

  /**
   * Get top referrers by visits for a date range
   */
  async getTopReferrers(
    options: GetBreakdownOptions,
  ): Promise<TopReferrerResult[]> {
    const query = `
      query GetTopReferrers($accountTag: String!, $siteTag: String!, $start: String!, $end: String!, $limit: Int!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { date_geq: $start }
                  { date_leq: $end }
                  { siteTag: $siteTag }
                ]
              }
              limit: $limit
              orderBy: [sum_visits_DESC]
            ) {
              sum {
                visits
              }
              dimensions {
                refererHost
              }
            }
          }
        }
      }
    `;

    const groups = await this.queryGraphQL<{
      sum: { visits: number };
      dimensions: { refererHost: string };
    }>(query, {
      ...this.baseVariables(options),
      limit: options.limit ?? 20,
    });

    return groups.map((g) => ({
      host: g.dimensions.refererHost || "(direct)",
      visits: g.sum.visits,
    }));
  }

  /**
   * Get device type breakdown for a date range
   */
  async getDeviceBreakdown(
    options: GetBreakdownOptions,
  ): Promise<DeviceBreakdownResult> {
    const query = `
      query GetDeviceBreakdown($accountTag: String!, $siteTag: String!, $start: String!, $end: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { date_geq: $start }
                  { date_leq: $end }
                  { siteTag: $siteTag }
                ]
              }
              limit: 10
            ) {
              sum {
                visits
              }
              dimensions {
                deviceType
              }
            }
          }
        }
      }
    `;

    const groups = await this.queryGraphQL<{
      sum: { visits: number };
      dimensions: { deviceType: string };
    }>(query, this.baseVariables(options));

    const breakdown: DeviceBreakdownResult = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
    };

    for (const g of groups) {
      const deviceType = g.dimensions.deviceType.toLowerCase();
      if (deviceType === "desktop") {
        breakdown.desktop = g.sum.visits;
      } else if (deviceType === "mobile") {
        breakdown.mobile = g.sum.visits;
      } else if (deviceType === "tablet") {
        breakdown.tablet = g.sum.visits;
      }
    }

    return breakdown;
  }

  /**
   * Get top countries by visits for a date range
   */
  async getTopCountries(
    options: GetBreakdownOptions,
  ): Promise<TopCountryResult[]> {
    const query = `
      query GetTopCountries($accountTag: String!, $siteTag: String!, $start: String!, $end: String!, $limit: Int!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            rumPageloadEventsAdaptiveGroups(
              filter: {
                AND: [
                  { date_geq: $start }
                  { date_leq: $end }
                  { siteTag: $siteTag }
                ]
              }
              limit: $limit
              orderBy: [sum_visits_DESC]
            ) {
              sum {
                visits
              }
              dimensions {
                countryName
              }
            }
          }
        }
      }
    `;

    const groups = await this.queryGraphQL<{
      sum: { visits: number };
      dimensions: { countryName: string };
    }>(query, {
      ...this.baseVariables(options),
      limit: options.limit ?? 20,
    });

    return groups.map((g) => ({
      country: g.dimensions.countryName,
      visits: g.sum.visits,
    }));
  }
}
