import { describe, it, expect } from "bun:test";
import { validateDomain } from "../../src/tools/dns-validation";

describe("DNS Validation", () => {
  describe("validateDomain", () => {
    it("should reject domains that do not exist", async () => {
      const result = await validateDomain(
        "https://this-domain-definitely-does-not-exist-12345.com/page",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Domain does not exist");
    });

    it("should accept valid domains", async () => {
      const result = await validateDomain("https://example.com/test");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept domains with subdomains", async () => {
      const result = await validateDomain("https://www.google.com/search");
      expect(result.valid).toBe(true);
    });

    it("should handle malformed URLs gracefully", async () => {
      const result = await validateDomain("not-a-valid-url");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });
  });
});
