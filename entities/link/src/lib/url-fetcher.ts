/**
 * URL Fetcher using Jina Reader API
 * Converts URLs to clean markdown content for AI extraction
 */

export interface FetchResult {
  success: boolean;
  content?: string;
  error?: string;
  errorType?: "url_not_found" | "url_unreachable" | "fetch_failed";
}

export interface UrlFetcherOptions {
  /** Jina API key for higher rate limits (500 RPM vs 20 RPM without key) */
  jinaApiKey?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Fetches clean markdown content from a URL using Jina Reader
 */
export class UrlFetcher {
  private readonly jinaBaseUrl = "https://r.jina.ai";
  private readonly timeout: number;
  private readonly apiKey: string | undefined;

  constructor(options?: UrlFetcherOptions) {
    this.timeout = options?.timeout ?? 30000; // 30 second default
    this.apiKey = options?.jinaApiKey;
  }

  /**
   * Fetch URL content as clean markdown
   */
  async fetch(url: string): Promise<FetchResult> {
    const jinaUrl = `${this.jinaBaseUrl}/${url}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const headers: Record<string, string> = {
        Accept: "text/markdown",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(jinaUrl, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.handleHttpError(response.status, url);
      }

      const content = await response.text();

      // Check if Jina returned an error or empty content
      if (!content || content.trim().length === 0) {
        return {
          success: false,
          error: `No content could be extracted from ${url}`,
          errorType: "fetch_failed",
        };
      }

      // Check for Jina's error responses (they sometimes return error messages in the body)
      if (
        content.includes("Error:") &&
        content.length < 500 &&
        !content.includes("\n\n")
      ) {
        return {
          success: false,
          error: content.trim(),
          errorType: "fetch_failed",
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return this.handleFetchError(error, url);
    }
  }

  /**
   * Handle HTTP error responses
   */
  private handleHttpError(status: number, url: string): FetchResult {
    // 400 is returned by Jina for invalid/non-existent domains
    if (status === 400) {
      return {
        success: false,
        error: `Invalid or non-existent URL: ${url}`,
        errorType: "url_not_found",
      };
    }

    if (status === 404) {
      return {
        success: false,
        error: `Page not found: ${url}`,
        errorType: "url_not_found",
      };
    }

    if (status >= 500) {
      return {
        success: false,
        error: `Server error while fetching ${url}`,
        errorType: "url_unreachable",
      };
    }

    return {
      success: false,
      error: `HTTP ${status} error while fetching ${url}`,
      errorType: "fetch_failed",
    };
  }

  /**
   * Handle fetch exceptions
   */
  private handleFetchError(error: unknown, url: string): FetchResult {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout while fetching ${url}`,
          errorType: "url_unreachable",
        };
      }

      // DNS/network errors
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("getaddrinfo")
      ) {
        return {
          success: false,
          error: `Domain not found: ${new URL(url).hostname}`,
          errorType: "url_not_found",
        };
      }

      if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT")
      ) {
        return {
          success: false,
          error: `Could not connect to ${url}`,
          errorType: "url_unreachable",
        };
      }

      return {
        success: false,
        error: `Failed to fetch ${url}: ${error.message}`,
        errorType: "fetch_failed",
      };
    }

    return {
      success: false,
      error: `Unknown error fetching ${url}`,
      errorType: "fetch_failed",
    };
  }
}
