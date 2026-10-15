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

    it("keeps the optional public beacon token separate from the metrics filter", () => {
      const cloudflare = {
        accountId: "account",
        apiToken: "private-api-token",
        siteTag: "metrics-tag",
        beaconToken: "public-beacon-token",
      };
      expect(analyticsConfigSchema.parse({ cloudflare })).toEqual({
        cloudflare,
      });
      expect(
        analyticsConfigSchema.safeParse({
          cloudflare: { ...cloudflare, beaconToken: 42 },
        }).success,
      ).toBe(false);
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
});
