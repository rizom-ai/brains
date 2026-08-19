import { describe, it, expect } from "bun:test";
import { socialMediaConfigSchema, linkedinConfigSchema } from "../src/config";

describe("Social Media Config", () => {
  describe("socialMediaConfigSchema", () => {
    // publishInterval, enabled, defaultPrompt, and maxRetries were declared
    // here and read nowhere. Credentials are the only configuration left.
    it("carries LinkedIn credentials", () => {
      const result = socialMediaConfigSchema.parse({
        linkedin: {
          accessToken: "token123",
          refreshToken: "refresh456",
          apiVersion: "202604",
        },
      });
      expect(result.linkedin?.accessToken).toBe("token123");
      expect(result.linkedin?.apiVersion).toBe("202604");
    });

    it("allows a brain with no credentials at all", () => {
      expect(socialMediaConfigSchema.parse({}).linkedin).toBeUndefined();
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

    it("should require LinkedIn API versions in YYYYMM format", () => {
      expect(
        linkedinConfigSchema.parse({ apiVersion: "202604" }).apiVersion,
      ).toBe("202604");
      expect(() =>
        linkedinConfigSchema.parse({ apiVersion: "2026-04" }),
      ).toThrow();
    });
  });
});
