import { describe, it, expect } from "bun:test";
import { socialMediaConfigSchema, linkedinConfigSchema } from "../src/config";

describe("Social Media Config", () => {
  describe("socialMediaConfigSchema", () => {
    it("should apply defaults for empty config", () => {
      const result = socialMediaConfigSchema.parse({});
      expect(result.publishInterval).toBe(3600000);
      expect(result.enabled).toBe(true);
      expect(result.maxRetries).toBe(3);
      expect(result.defaultPrompt).toBeDefined();
    });

    it("should accept complete config", () => {
      const config = {
        linkedin: {
          accessToken: "token123",
          refreshToken: "refresh456",
        },
        publishInterval: 1800000,
        enabled: false,
        defaultPrompt: "Custom prompt",
        maxRetries: 5,
      };
      const result = socialMediaConfigSchema.parse(config);
      expect(result.linkedin?.accessToken).toBe("token123");
      expect(result.publishInterval).toBe(1800000);
      expect(result.enabled).toBe(false);
      expect(result.maxRetries).toBe(5);
    });

    it("should allow config without linkedin credentials", () => {
      const result = socialMediaConfigSchema.parse({
        enabled: true,
      });
      expect(result.linkedin).toBeUndefined();
      expect(result.enabled).toBe(true);
    });
  });

  describe("linkedinConfigSchema", () => {
    it("should accept empty config", () => {
      const result = linkedinConfigSchema.parse({});
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
    });

    it("should accept partial credentials", () => {
      const result = linkedinConfigSchema.parse({
        accessToken: "token123",
      });
      expect(result.accessToken).toBe("token123");
      expect(result.refreshToken).toBeUndefined();
    });
  });
});
