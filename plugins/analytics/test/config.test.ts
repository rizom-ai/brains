import { describe, it, expect } from "bun:test";
import { analyticsConfigSchema } from "../src/config";

describe("Analytics Config Schema", () => {
  describe("empty config", () => {
    it("should validate empty config", () => {
      const result = analyticsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("posthog config", () => {
    it("should validate complete posthog config", () => {
      const config = {
        posthog: {
          enabled: true,
          projectId: "12345",
          apiKey: "phx_secret",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should default enabled to false", () => {
      const config = {
        posthog: {
          projectId: "12345",
          apiKey: "phx_secret",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.posthog?.enabled).toBe(false);
      }
    });

    it("should require projectId when posthog is provided", () => {
      const config = {
        posthog: {
          enabled: true,
          apiKey: "phx_secret",
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("should require apiKey when posthog is provided", () => {
      const config = {
        posthog: {
          enabled: true,
          projectId: "12345",
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
    it("should validate config with both posthog and social", () => {
      const config = {
        posthog: {
          enabled: true,
          projectId: "12345",
          apiKey: "phx_secret",
        },
        social: {
          enabled: true,
        },
      };

      const result = analyticsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should validate config with only posthog", () => {
      const config = {
        posthog: {
          enabled: true,
          projectId: "12345",
          apiKey: "phx_secret",
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
