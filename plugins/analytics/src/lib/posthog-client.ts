import type { PosthogConfig } from "../config";

/**
 * PostHog API insight response
 */
export interface PostHogInsightResponse {
  result: Array<{
    data: number[];
    days?: string[];
    labels?: string[];
    label?: string;
    count?: number;
  }>;
}

/**
 * Options for fetching insights
 */
export interface GetInsightsOptions {
  startDate: string;
  endDate: string;
  event: string;
  breakdown?: string;
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
 * PostHog EU Cloud API client
 *
 * Fetches website analytics data from PostHog.
 * Uses EU Cloud base URL for GDPR compliance.
 *
 * @see https://posthog.com/docs/api
 */
export class PostHogClient {
  private readonly baseUrl = "https://eu.posthog.com";

  constructor(private config: PosthogConfig) {}

  /**
   * Fetch trend insights from PostHog
   */
  async getInsights(
    options: GetInsightsOptions,
  ): Promise<PostHogInsightResponse> {
    const params = new URLSearchParams({
      events: JSON.stringify([{ id: options.event, type: "events" }]),
      date_from: options.startDate,
      date_to: options.endDate,
      display: "ActionsTable",
    });

    if (options.breakdown) {
      params.set("breakdown", options.breakdown);
    }

    const url = `${this.baseUrl}/api/projects/${this.config.projectId}/insights/trend?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PostHog API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<PostHogInsightResponse>;
  }

  /**
   * Get aggregated website statistics for a date range
   *
   * Fetches pageviews, unique visitors, and sessions from PostHog
   */
  async getWebsiteStats(
    options: GetWebsiteStatsOptions,
  ): Promise<WebsiteStats> {
    // Fetch pageviews
    const pageviewsResponse = await this.getInsights({
      startDate: options.startDate,
      endDate: options.endDate,
      event: "$pageview",
    });

    // Fetch unique visitors (distinct_id count)
    const visitorsResponse = await this.getInsights({
      startDate: options.startDate,
      endDate: options.endDate,
      event: "$pageview",
      breakdown: "distinct_id",
    });

    // Fetch sessions
    const sessionsResponse = await this.getInsights({
      startDate: options.startDate,
      endDate: options.endDate,
      event: "$session_start",
    });

    // Extract totals from responses
    const pageviews = this.extractTotal(pageviewsResponse);
    const visitors = this.extractUniqueCount(visitorsResponse);
    const visits = this.extractTotal(sessionsResponse);

    // Note: PostHog doesn't provide bounce rate and time on page directly
    // These would require additional queries or custom events
    // For now, we return 0 and compute them later if needed
    return {
      pageviews,
      visitors,
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
      const url = `${this.baseUrl}/api/projects/${this.config.projectId}/insights?limit=1`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Extract total count from insight response
   */
  private extractTotal(response: PostHogInsightResponse): number {
    if (response.result.length === 0) {
      return 0;
    }

    const firstResult = response.result[0];
    if (firstResult?.count !== undefined) {
      return firstResult.count;
    }

    // Sum the data array if count is not provided
    if (firstResult?.data) {
      return firstResult.data.reduce((sum, val) => sum + val, 0);
    }

    return 0;
  }

  /**
   * Extract unique count from breakdown response
   */
  private extractUniqueCount(response: PostHogInsightResponse): number {
    if (response.result.length === 0) {
      return 0;
    }

    // For breakdown queries, count is the number of unique values
    if (response.result[0]?.count !== undefined) {
      return response.result[0].count;
    }

    // Otherwise count the number of results (each is a unique value)
    return response.result.length;
  }
}
