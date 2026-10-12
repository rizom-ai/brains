import { describe, it, expect, beforeEach, mock, type Mock } from "bun:test";
import {
  CloudflareClient,
  type CloudflareFetch,
} from "../src/lib/cloudflare-client";
import type { CloudflareConfig } from "../src/config";
import { caughtError } from "@brains/test-utils";

// The client is built with a delegate to this, so a test can stub before or
// after construction. Unstubbed calls fail loudly rather than reaching the
// network. It is a mock() so tests can read the requests off it.
let fetchFn: Mock<CloudflareFetch> = mock(() =>
  Promise.reject(new Error("fetch called without a stub")),
);
const delegatingFetch: CloudflareFetch = (url, init) => fetchFn(url, init);

/** Point the client's fetch at a recording fake for the current test. */
function installMockFetch(handler: CloudflareFetch): void {
  fetchFn = mock(handler);
}

/**
 * Install a mock fetch that captures the request body and returns a getter
 * for the parsed JSON body after the request completes.
 */
function installCapturingMockFetch(response: object): () => unknown {
  let capturedBody: string | undefined;
  installMockFetch((_url, options) => {
    if (typeof options.body === "string") {
      capturedBody = options.body;
    }
    return Promise.resolve(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  return () => {
    if (capturedBody === undefined) {
      throw new Error("No request body was captured");
    }
    return JSON.parse(capturedBody);
  };
}

/** Install a mock fetch that always resolves with the given response. */
function installStaticMockFetch(response: Response): void {
  installMockFetch(() => Promise.resolve(response));
}

describe("CloudflareClient", () => {
  let client: CloudflareClient;
  let config: CloudflareConfig;

  beforeEach(() => {
    config = {
      accountId: "test_account_id",
      apiToken: "cf_test_api_token",
      siteTag: "test_site_tag",
    };
    client = new CloudflareClient(config, { fetch: delegatingFetch });
  });

  describe("getDailyTraffic", () => {
    const groups = (
      overrides: Partial<Record<string, unknown[]>> = {},
    ): object => ({
      data: {
        viewer: {
          accounts: [
            {
              total: [
                { count: 49, sum: { visits: 10 }, avg: { sampleInterval: 1 } },
              ],
              paths: [
                { count: 20, dimensions: { requestPath: "/" } },
                { count: 6, dimensions: { requestPath: "/essays/a" } },
                { count: 2, dimensions: { requestPath: "/essays/a/" } },
              ],
              referrers: [
                {
                  sum: { visits: 4 },
                  dimensions: { refererHost: "www.linkedin.com" },
                },
                { sum: { visits: 5 }, dimensions: { refererHost: "" } },
              ],
              pathReferrers: [
                {
                  sum: { visits: 3 },
                  dimensions: {
                    requestPath: "/essays/a",
                    refererHost: "www.linkedin.com",
                  },
                },
              ],
              countries: [
                { sum: { visits: 6 }, dimensions: { countryName: "TW" } },
              ],
              ...overrides,
            },
          ],
        },
      },
      errors: null,
    });

    it("throws on an API failure", async () => {
      installStaticMockFetch(new Response("Unauthorized", { status: 401 }));

      let error: Error | null = null;
      try {
        await client.getDailyTraffic("2026-10-05");
      } catch (e) {
        error = caughtError(e);
      }

      expect(error?.message).toContain("Cloudflare API error: 401");
    });

    it("throws on GraphQL errors, naming them", async () => {
      installStaticMockFetch(
        new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "Invalid query" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      let error: Error | null = null;
      try {
        await client.getDailyTraffic("2026-10-05");
      } catch (e) {
        error = caughtError(e);
      }

      expect(error?.message).toContain("Cloudflare GraphQL error");
      expect(error?.message).toContain("Invalid query");
    });

    it("reads one day's totals and breakdowns in one request", async () => {
      const body = installCapturingMockFetch(groups());

      const day = await client.getDailyTraffic("2026-10-05");

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(body()).toMatchObject({
        variables: { siteTag: "test_site_tag", date: "2026-10-05" },
      });
      expect(day).toEqual({
        date: "2026-10-05",
        pageviews: 49,
        visits: 10,
        estimated: false,
        paths: [
          { path: "/", pageviews: 20 },
          { path: "/essays/a", pageviews: 8 },
        ],
        referrers: [
          { host: "(direct)", visits: 5 },
          { host: "www.linkedin.com", visits: 4 },
        ],
        pathReferrers: [
          { path: "/essays/a", host: "www.linkedin.com", visits: 3 },
        ],
        countries: [{ country: "TW", visits: 6 }],
      });
    });

    // Navigation within the site carries its own host as referrer but starts
    // no visit; such rows would crowd the real referrers out of the top ten.
    it("drops referrer and country rows without visits", async () => {
      installCapturingMockFetch(
        groups({
          referrers: [
            {
              sum: { visits: 4 },
              dimensions: { refererHost: "www.linkedin.com" },
            },
            { sum: { visits: 0 }, dimensions: { refererHost: "yeehaa.io" } },
          ],
          pathReferrers: [
            {
              sum: { visits: 0 },
              dimensions: {
                requestPath: "/ask",
                refererHost: "preview.yeehaa.io",
              },
            },
          ],
          countries: [
            { sum: { visits: 0 }, dimensions: { countryName: "NL" } },
          ],
        }),
      );

      const day = await client.getDailyTraffic("2026-10-05");

      expect(day.referrers).toEqual([{ host: "www.linkedin.com", visits: 4 }]);
      expect(day.pathReferrers).toEqual([]);
      expect(day.countries).toEqual([]);
    });

    it("marks a day Cloudflare already sampled as an estimate", async () => {
      installCapturingMockFetch(
        groups({
          total: [
            { count: 130, sum: { visits: 130 }, avg: { sampleInterval: 10 } },
          ],
        }),
      );

      expect((await client.getDailyTraffic("2026-09-25")).estimated).toBe(true);
    });

    it("reads a day without traffic as zeros", async () => {
      installCapturingMockFetch(
        groups({
          total: [],
          paths: [],
          referrers: [],
          pathReferrers: [],
          countries: [],
        }),
      );

      expect(await client.getDailyTraffic("2026-09-23")).toEqual({
        date: "2026-09-23",
        pageviews: 0,
        visits: 0,
        estimated: false,
        paths: [],
        referrers: [],
        pathReferrers: [],
        countries: [],
      });
    });
  });

  describe("getSiteCreatedAt", () => {
    it("returns the creation date of the configured Web Analytics site", async () => {
      installStaticMockFetch(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              { site_tag: "other", created: "2026-04-01T07:56:49Z" },
              {
                site_tag: "test_site_tag",
                created: "2026-04-11T16:15:29.199964Z",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      expect(await client.getSiteCreatedAt()).toBe("2026-04-11");
      expect(fetchFn).toHaveBeenCalledWith(
        "https://api.cloudflare.com/client/v4/accounts/test_account_id/rum/site_info/list?per_page=100",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer cf_test_api_token",
          }),
        }),
      );
    });

    it("returns null when the site is not listed", async () => {
      installStaticMockFetch(
        new Response(JSON.stringify({ success: true, result: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(await client.getSiteCreatedAt()).toBeNull();
    });

    it("throws on an API failure", async () => {
      installStaticMockFetch(new Response("Forbidden", { status: 403 }));

      expect(client.getSiteCreatedAt()).rejects.toThrow(
        "Cloudflare API error: 403",
      );
    });
  });
});
