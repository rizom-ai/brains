import { z } from "@brains/utils/zod-v4";
import type { CloudflareConfig } from "../config";

const graphqlErrorEnvelopeSchema = z.looseObject({
  errors: z.array(z.looseObject({ message: z.string() })).optional(),
});

export interface CloudflareAnalyticsData {
  viewer: {
    accounts: Array<{
      rumPageloadEventsAdaptiveGroups: Array<{
        count: number;
        sum: { visits: number };
        dimensions: { date: string };
      }>;
    }>;
  };
}

const analyticsDataSchema: z.ZodType<CloudflareAnalyticsData> = z.object({
  viewer: z.object({
    accounts: z.array(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(
          z.object({
            count: z.number(),
            sum: z.object({ visits: z.number() }),
            dimensions: z.object({ date: z.string() }),
          }),
        ),
      }),
    ),
  }),
});

const topPagesDataSchema = z.object({
  viewer: z.object({
    accounts: z.array(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(
          z.object({
            count: z.number(),
            dimensions: z.object({ requestPath: z.string() }),
          }),
        ),
      }),
    ),
  }),
});

const topReferrersDataSchema = z.object({
  viewer: z.object({
    accounts: z.array(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(
          z.object({
            sum: z.object({ visits: z.number() }),
            dimensions: z.object({ refererHost: z.string() }),
          }),
        ),
      }),
    ),
  }),
});

const deviceBreakdownDataSchema = z.object({
  viewer: z.object({
    accounts: z.array(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(
          z.object({
            sum: z.object({ visits: z.number() }),
            dimensions: z.object({ deviceType: z.string() }),
          }),
        ),
      }),
    ),
  }),
});

const topCountriesDataSchema = z.object({
  viewer: z.object({
    accounts: z.array(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(
          z.object({
            sum: z.object({ visits: z.number() }),
            dimensions: z.object({ countryName: z.string() }),
          }),
        ),
      }),
    ),
  }),
});

const validationDataSchema = z.object({
  viewer: z.object({
    accounts: z.array(z.object({ accountTag: z.string() })),
  }),
});

/**
 * Cloudflare Web Analytics GraphQL response
 */
export interface CloudflareAnalyticsResponse {
  data: CloudflareAnalyticsData;
  errors?: Array<{ message: string }> | undefined;
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

function parseGraphqlData<T>(payload: unknown, dataSchema: z.ZodType<T>): T {
  const errorEnvelope = graphqlErrorEnvelopeSchema.safeParse(payload);
  if (errorEnvelope.success && errorEnvelope.data.errors?.length) {
    throw new Error(
      `Cloudflare GraphQL error: ${errorEnvelope.data.errors
        .map((e) => e.message)
        .join(", ")}`,
    );
  }

  return z.object({ data: dataSchema }).parse(payload).data;
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
  private config: CloudflareConfig;
  private readonly graphqlUrl = "https://api.cloudflare.com/client/v4/graphql";

  constructor(config: CloudflareConfig) {
    this.config = config;
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

    // Ensure dates are in YYYY-MM-DD format (truncate any time component)
    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
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

    const data = parseGraphqlData(await response.json(), analyticsDataSchema);

    // Aggregate the results
    const groups =
      data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];

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

      parseGraphqlData(await response.json(), validationDataSchema);
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

    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
      limit: options.limit ?? 20,
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

    const data = parseGraphqlData(await response.json(), topPagesDataSchema);

    const groups =
      data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];

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

    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
      limit: options.limit ?? 20,
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

    const data = parseGraphqlData(
      await response.json(),
      topReferrersDataSchema,
    );

    const groups =
      data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];

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

    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
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

    const data = parseGraphqlData(
      await response.json(),
      deviceBreakdownDataSchema,
    );

    const groups =
      data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];

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

    const variables = {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      start: options.startDate.split("T")[0],
      end: options.endDate.split("T")[0],
      limit: options.limit ?? 20,
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

    const data = parseGraphqlData(
      await response.json(),
      topCountriesDataSchema,
    );

    const groups =
      data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];

    return groups.map((g) => ({
      country: g.dimensions.countryName,
      visits: g.sum.visits,
    }));
  }
}
