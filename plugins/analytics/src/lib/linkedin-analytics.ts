/**
 * LinkedIn Analytics API response for share statistics
 */
interface LinkedInShareStatisticsResponse {
  elements: Array<{
    totalShareStatistics: {
      impressionCount: number;
      likeCount: number;
      commentCount: number;
      shareCount: number;
      clickCount?: number;
      engagement?: number;
    };
  }>;
}

/**
 * Post analytics result
 */
export interface PostAnalytics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * LinkedIn Analytics API client
 *
 * Fetches engagement metrics for LinkedIn posts using the Share Statistics API.
 * Requires OAuth2 access token with `r_member_social` scope.
 *
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/share-statistics
 */
export class LinkedInAnalyticsClient {
  private readonly apiBaseUrl = "https://api.linkedin.com/v2";

  constructor(private accessToken: string) {}

  /**
   * Get analytics for a LinkedIn post by its URN
   *
   * @param postUrn - The post URN (e.g., "urn:li:ugcPost:1234567890")
   * @returns Post analytics with impressions, likes, comments, shares
   */
  async getPostAnalytics(postUrn: string): Promise<PostAnalytics> {
    const encodedUrn = encodeURIComponent(postUrn);

    // Use the organizationalEntityShareStatistics endpoint for personal posts
    // shares parameter takes the list of share URNs to get stats for
    const url = `${this.apiBaseUrl}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=&shares=List(${encodedUrn})`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LinkedIn API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as LinkedInShareStatisticsResponse;

    // Return zeros if no data found
    const element = result.elements?.[0];
    if (!element?.totalShareStatistics) {
      return {
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      };
    }

    const stats = element.totalShareStatistics;

    return {
      impressions: stats.impressionCount ?? 0,
      likes: stats.likeCount ?? 0,
      comments: stats.commentCount ?? 0,
      shares: stats.shareCount ?? 0,
    };
  }

  /**
   * Validate that credentials are configured and working
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Use the userinfo endpoint to validate the token
      const response = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
