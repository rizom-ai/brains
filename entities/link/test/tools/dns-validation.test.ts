import { describe, it, expect } from "bun:test";
import { validateDomain } from "../../src/tools/dns-validation";
import type { DnsLookup } from "../../src/tools/dns-validation";

/**
 * These tests used to resolve real domains against the live resolver. That
 * made them fail on slow DNS (bun's 5s test timeout) and on resolvers that
 * answer NXDOMAIN with a wildcard address. The lookup is injected instead,
 * so each test states exactly what the resolver did.
 */

function failingLookup(code: string): DnsLookup {
  return () => {
    const error: NodeJS.ErrnoException = new Error(`getaddrinfo ${code}`);
    error.code = code;
    return Promise.reject(error);
  };
}

const resolvingLookup: DnsLookup = () =>
  Promise.resolve({ address: "93.184.215.14", family: 4 });

describe("DNS Validation", () => {
  describe("validateDomain", () => {
    it("should reject domains that do not exist", async () => {
      const result = await validateDomain(
        "https://this-domain-definitely-does-not-exist-12345.com/page",
        failingLookup("ENOTFOUND"),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Domain does not exist");
    });

    it("should accept valid domains", async () => {
      const result = await validateDomain(
        "https://example.com/test",
        resolvingLookup,
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should look up the hostname, not the full URL", async () => {
      const seen: string[] = [];
      await validateDomain("https://www.example.com/search?q=1", (hostname) => {
        seen.push(hostname);
        return resolvingLookup(hostname);
      });
      expect(seen).toEqual(["www.example.com"]);
    });

    it("should report temporary DNS failures as invalid", async () => {
      const result = await validateDomain(
        "https://example.com/test",
        failingLookup("EAI_AGAIN"),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("DNS lookup failed (temporary)");
    });

    it("should pass other DNS errors through as valid", async () => {
      const result = await validateDomain(
        "https://example.com/test",
        failingLookup("ESERVFAIL"),
      );
      expect(result.valid).toBe(true);
    });

    it("should handle malformed URLs gracefully", async () => {
      const lookupNeverReached: DnsLookup = () => {
        throw new Error("lookup must not run for an unparseable URL");
      };
      const result = await validateDomain(
        "not-a-valid-url",
        lookupNeverReached,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL");
    });
  });
});
