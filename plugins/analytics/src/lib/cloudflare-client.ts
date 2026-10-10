import { z } from "@brains/utils/zod";
import type { CloudflareConfig } from "../config";
import type { TrafficDay } from "../entity/schema";

/**
 * What the client needs from a response: the status check and the body,
 * as JSON on success and text on failure. A real Response satisfies this,
 * and so does a test's bare object.
 */
export type CloudflareFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json" | "text">>;

/**
 * Runtime collaborators that are not configuration. Production leaves fetch
 * unset and the client uses the global; a test hands in a fake and reads the
 * requests off it instead of reassigning globalThis.fetch.
 */
export interface CloudflareClientDeps {
  fetch?: CloudflareFetch | undefined;
}

/**
 * Cloudflare Web Analytics GraphQL response envelope.
 *
 * `data` is nullable because Cloudflare omits it when the query itself fails,
 * in which case `errors` carries the reason — so the error branch below has to
 * run before `data` is required. `errors` is nullable too: a successful
 * response carries `errors: null`.
 */
function cloudflareGraphQLResponseSchema<TAccount>(
  accountSchema: z.ZodType<TAccount>,
): z.ZodType<{
  data?: { viewer: { accounts: TAccount[] } } | null | undefined;
  errors?: Array<{ message: string }> | null | undefined;
}> {
  return z.object({
    data: z
      .object({ viewer: z.object({ accounts: z.array(accountSchema) }) })
      .nullish(),
    errors: z.array(z.object({ message: z.string() })).nullish(),
  });
}

/** One day's aliased breakdowns, as `getDailyTraffic` asks for them. */
const dailyTrafficAccountSchema = z.object({
  total: z.array(
    z.object({
      count: z.number(),
      sum: z.object({ visits: z.number() }),
      avg: z.object({ sampleInterval: z.number() }),
    }),
  ),
  paths: z.array(
    z.object({
      count: z.number(),
      dimensions: z.object({ requestPath: z.string() }),
    }),
  ),
  referrers: z.array(
    z.object({
      sum: z.object({ visits: z.number() }),
      dimensions: z.object({ refererHost: z.string() }),
    }),
  ),
  pathReferrers: z.array(
    z.object({
      sum: z.object({ visits: z.number() }),
      dimensions: z.object({
        requestPath: z.string(),
        refererHost: z.string(),
      }),
    }),
  ),
  countries: z.array(
    z.object({
      sum: z.object({ visits: z.number() }),
      dimensions: z.object({ countryName: z.string() }),
    }),
  ),
});

const siteInfoListSchema = z.object({
  result: z.array(z.object({ site_tag: z.string(), created: z.string() })),
});

/**
 * Cloudflare scales a sampled day's counts by its sample interval; above
 * about 1.5 the day's numbers are estimates rather than counts.
 */
const ESTIMATE_SAMPLE_INTERVAL = 1.5;

/** `/essays/a/` and `/essays/a` are one page; the root stays `/`. */
function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function hostOrDirect(host: string): string {
  return host === "" ? "(direct)" : host;
}

/**
 * Sum rows that share a key after normalizing, largest first, dropping keys
 * that total nothing (navigation within the site starts no visit).
 */
function mergeBy<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => number,
): Array<{ key: string; total: number; row: T }> {
  const merged = rows.reduce((acc, row) => {
    const k = key(row);
    const prior = acc.get(k);
    acc.set(k, {
      key: k,
      total: (prior?.total ?? 0) + Math.round(value(row)),
      row: prior?.row ?? row,
    });
    return acc;
  }, new Map<string, { key: string; total: number; row: T }>());
  return [...merged.values()]
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
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
  private fetchFn: CloudflareFetch | undefined;

  constructor(config: CloudflareConfig, deps: CloudflareClientDeps = {}) {
    this.config = config;
    this.fetchFn = deps.fetch;
  }

  /** Call the Cloudflare API and return the JSON body, or throw on a failure status. */
  private async request(url: string, init: RequestInit): Promise<unknown> {
    const response = await (this.fetchFn ?? fetch)(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API error: ${response.status} - ${errorText}`,
      );
    }

    return response.json();
  }

  /** Execute a GraphQL query and return the first account in the response. */
  private async queryAccount<TAccount>(
    accountSchema: z.ZodType<TAccount>,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TAccount | undefined> {
    const result = cloudflareGraphQLResponseSchema(accountSchema).parse(
      await this.request(this.graphqlUrl, {
        method: "POST",
        body: JSON.stringify({ query, variables }),
      }),
    );

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Cloudflare GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`,
      );
    }

    if (!result.data) {
      throw new Error("Cloudflare GraphQL response contained no data");
    }

    return result.data.viewer.accounts[0];
  }

  /**
   * Execute a GraphQL query and return the adaptive groups from the
   * first account in the response.
   */
  private async queryGraphQL<TGroup>(
    groupSchema: z.ZodType<TGroup>,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<TGroup[]> {
    const account = await this.queryAccount(
      z.object({
        rumPageloadEventsAdaptiveGroups: z.array(groupSchema).optional(),
      }),
      query,
      variables,
    );
    return account?.rumPageloadEventsAdaptiveGroups ?? [];
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

    const groups = await this.queryGraphQL(
      z.object({
        count: z.number(),
        sum: z.object({ visits: z.number() }),
        dimensions: z.object({ date: z.string() }),
      }),
      query,
      this.baseVariables(options),
    );

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
      await this.queryGraphQL(z.unknown(), query, {
        accountTag: this.config.accountId,
      });
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

    const groups = await this.queryGraphQL(
      z.object({
        count: z.number(),
        dimensions: z.object({ requestPath: z.string() }),
      }),
      query,
      { ...this.baseVariables(options), limit: options.limit ?? 20 },
    );

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

    const groups = await this.queryGraphQL(
      z.object({
        sum: z.object({ visits: z.number() }),
        dimensions: z.object({ refererHost: z.string() }),
      }),
      query,
      { ...this.baseVariables(options), limit: options.limit ?? 20 },
    );

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

    const groups = await this.queryGraphQL(
      z.object({
        sum: z.object({ visits: z.number() }),
        dimensions: z.object({ deviceType: z.string() }),
      }),
      query,
      this.baseVariables(options),
    );

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

    const groups = await this.queryGraphQL(
      z.object({
        sum: z.object({ visits: z.number() }),
        dimensions: z.object({ countryName: z.string() }),
      }),
      query,
      { ...this.baseVariables(options), limit: options.limit ?? 20 },
    );

    return groups.map((g) => ({
      country: g.dimensions.countryName,
      visits: g.sum.visits,
    }));
  }

  /**
   * One day of traffic in one request: totals with Cloudflare's sample
   * interval, top paths, referrers, path × referrer pairs and countries.
   * Asked per day because that is the finest sampling Cloudflare offers.
   */
  async getDailyTraffic(date: string): Promise<TrafficDay> {
    const day = `{ AND: [{ date: $date }, { siteTag: $siteTag }] }`;
    const query = `
      query DailyTraffic($accountTag: String!, $siteTag: String!, $date: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            total: rumPageloadEventsAdaptiveGroups(filter: ${day}, limit: 1) {
              count
              sum { visits }
              avg { sampleInterval }
            }
            paths: rumPageloadEventsAdaptiveGroups(filter: ${day}, limit: 25, orderBy: [count_DESC]) {
              count
              dimensions { requestPath }
            }
            referrers: rumPageloadEventsAdaptiveGroups(filter: ${day}, limit: 10, orderBy: [sum_visits_DESC]) {
              sum { visits }
              dimensions { refererHost }
            }
            pathReferrers: rumPageloadEventsAdaptiveGroups(filter: ${day}, limit: 25, orderBy: [sum_visits_DESC]) {
              sum { visits }
              dimensions { requestPath refererHost }
            }
            countries: rumPageloadEventsAdaptiveGroups(filter: ${day}, limit: 10, orderBy: [sum_visits_DESC]) {
              sum { visits }
              dimensions { countryName }
            }
          }
        }
      }
    `;

    const account = await this.queryAccount(dailyTrafficAccountSchema, query, {
      accountTag: this.config.accountId,
      siteTag: this.config.siteTag,
      date,
    });
    const total = account?.total[0];

    return {
      date,
      pageviews: Math.round(total?.count ?? 0),
      visits: Math.round(total?.sum.visits ?? 0),
      estimated: (total?.avg.sampleInterval ?? 1) > ESTIMATE_SAMPLE_INTERVAL,
      paths: mergeBy(
        account?.paths ?? [],
        (g) => normalizePath(g.dimensions.requestPath),
        (g) => g.count,
      ).map(({ key, total: pageviews }) => ({ path: key, pageviews })),
      referrers: mergeBy(
        account?.referrers ?? [],
        (g) => hostOrDirect(g.dimensions.refererHost),
        (g) => g.sum.visits,
      ).map(({ key, total: visits }) => ({ host: key, visits })),
      pathReferrers: mergeBy(
        account?.pathReferrers ?? [],
        (g) =>
          `${normalizePath(g.dimensions.requestPath)}\n${hostOrDirect(g.dimensions.refererHost)}`,
        (g) => g.sum.visits,
      ).map(({ row, total: visits }) => ({
        path: normalizePath(row.dimensions.requestPath),
        host: hostOrDirect(row.dimensions.refererHost),
        visits,
      })),
      countries: mergeBy(
        account?.countries ?? [],
        (g) => g.dimensions.countryName,
        (g) => g.sum.visits,
      ).map(({ key, total: visits }) => ({ country: key, visits })),
    };
  }

  /**
   * The date (`YYYY-MM-DD`) the configured Web Analytics site was created,
   * the earliest day it can have traffic; null when it is not listed.
   */
  async getSiteCreatedAt(): Promise<string | null> {
    const sites = siteInfoListSchema.parse(
      await this.request(
        `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/rum/site_info/list?per_page=100`,
        { method: "GET" },
      ),
    );
    const site = sites.result.find((s) => s.site_tag === this.config.siteTag);
    return site ? site.created.slice(0, 10) : null;
  }
}
