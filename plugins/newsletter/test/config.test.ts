import { describe, it, expect } from "bun:test";
import { newsletterConfigSchema, buttondownConfigSchema } from "../src/config";

describe("Newsletter Config Schema", () => {
  describe("buttondownConfigSchema", () => {
    it("should require apiKey", () => {
      const result = buttondownConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should accept valid config with apiKey", () => {
      const result = buttondownConfigSchema.safeParse({
        apiKey: "test-key",
      });
      expect(result.success).toBe(true);
      expect(result.data?.apiKey).toBe("test-key");
    });

    it("should default doubleOptIn to true", () => {
      const result = buttondownConfigSchema.safeParse({
        apiKey: "test-key",
      });
      expect(result.success).toBe(true);
      expect(result.data?.doubleOptIn).toBe(true);
    });

    it("should allow overriding doubleOptIn", () => {
      const result = buttondownConfigSchema.safeParse({
        apiKey: "test-key",
        doubleOptIn: false,
      });
      expect(result.success).toBe(true);
      expect(result.data?.doubleOptIn).toBe(false);
    });
  });

  describe("newsletterConfigSchema", () => {
    it("should allow empty config", () => {
      const result = newsletterConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should allow config with buttondown", () => {
      const result = newsletterConfigSchema.safeParse({
        buttondown: {
          apiKey: "test-key",
        },
      });
      expect(result.success).toBe(true);
      expect(result.data?.buttondown?.apiKey).toBe("test-key");
    });
  });
});
