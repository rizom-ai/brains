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

  describe("social config", () => {
    it("should validate social config with enabled true", () => {
      const config = {
        social: {
          enabled: true,
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate social config with enabled false", () => {
      const config = {
        social: {
          enabled: false,
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should default enabled to false for social", () => {
      const config = {
        social: {},
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.social?.enabled).toBe(false);
      }
    });
  });

  describe("combined config", () => {
    it("should validate config with both cloudflare and social", () => {
      const config = {
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token_secret",
          siteTag: "site123",
        },
        social: {
          enabled: true,
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

    it("should validate config with only social", () => {
      const config = {
        social: {
          enabled: true,
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
