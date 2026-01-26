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

  describe("cron config", () => {
    it("should use default cron schedules when not provided", () => {
      const config = {
        cron: {},
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cron?.websiteMetrics).toBe("0 2 * * *");
      }
    });

    it("should accept custom cron schedules", () => {
      const config = {
        cron: {
          websiteMetrics: "0 3 * * *",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cron?.websiteMetrics).toBe("0 3 * * *");
      }
    });
  });

  describe("combined config", () => {
    it("should validate config with cloudflare and cron", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
        cron: {
          websiteMetrics: "0 4 * * *",
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
  });
});
