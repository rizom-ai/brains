import { describe, it, expect } from "bun:test";
import { analyticsConfigSchema } from "../src/config";

describe("Analytics Config Schema", () => {
  describe("empty config", () => {
    it("should validate empty config", () => {
      const result = analyticsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("cloudflare config", () => {
    it("should validate complete cloudflare config", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should require accountId when cloudflare is provided", () => {
      const config = {
        cloudflare: {
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should require apiToken when cloudflare is provided", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          siteTag: "site123",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should require siteTag when cloudflare is provided", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("linkedin config", () => {
    it("should validate linkedin config with access token", () => {
      const config = {
        linkedin: {
          accessToken: "AQVh7...",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should require accessToken when linkedin is provided", () => {
      const config = {
        linkedin: {},
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("cron config", () => {
    it("should use default cron schedules when not provided", () => {
      const config = {
        cron: {},
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cron?.websiteMetrics).toBe("0 2 * * *");
        expect(result.data.cron?.socialMetrics).toBe("0 */6 * * *");
      }
    });

    it("should accept custom cron schedules", () => {
      const config = {
        cron: {
          websiteMetrics: "0 3 * * *",
          socialMetrics: "0 */12 * * *",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cron?.websiteMetrics).toBe("0 3 * * *");
        expect(result.data.cron?.socialMetrics).toBe("0 */12 * * *");
      }
    });

    it("should allow partial cron config with defaults for missing fields", () => {
      const config = {
        cron: {
          websiteMetrics: "0 4 * * *",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cron?.websiteMetrics).toBe("0 4 * * *");
        expect(result.data.cron?.socialMetrics).toBe("0 */6 * * *");
      }
    });
  });

  describe("combined config", () => {
    it("should validate config with both cloudflare and linkedin", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
        linkedin: {
          accessToken: "AQVh7...",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate config with only cloudflare", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate config with only linkedin", () => {
      const config = {
        linkedin: {
          accessToken: "AQVh7...",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
