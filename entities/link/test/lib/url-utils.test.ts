import { describe, it, expect } from "bun:test";
import { UrlUtils } from "../../src/lib/url-utils";

describe("UrlUtils", () => {
  describe("extractUrls", () => {
    it("should extract HTTP and HTTPS URLs from text", () => {
      const text =
        "Check out https://github.com/user/repo and http://example.com";
      const urls = UrlUtils.extractUrls(text);

      expect(urls).toEqual([
        "https://github.com/user/repo",
        "http://example.com",
      ]);
    });

    it("should remove duplicate URLs within the same message", () => {
      const text =
        "Visit https://example.com and also https://example.com again";
      const urls = UrlUtils.extractUrls(text);

      expect(urls).toEqual(["https://example.com"]);
    });

    it("should handle text with no URLs", () => {
      const text = "This is just plain text with no links";
      const urls = UrlUtils.extractUrls(text);

      expect(urls).toEqual([]);
    });

    it("should extract URLs with complex paths and characters", () => {
      const text =
        "API docs at https://api.example.com/v1/users?id=123&name=test#section";
      const urls = UrlUtils.extractUrls(text);

      expect(urls).toEqual([
        "https://api.example.com/v1/users?id=123&name=test#section",
      ]);
    });

    it("should not extract invalid protocols", () => {
      const text =
        "Invalid: ftp://files.com, valid: https://example.com, invalid: file:///path";
      const urls = UrlUtils.extractUrls(text);

      expect(urls).toEqual(["https://example.com"]);
    });
  });

  describe("normalizeUrl", () => {
    it("should remove query parameters", () => {
      const url = "https://example.com/page?utm_source=twitter&ref=123";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("https://example.com/page");
    });

    it("should remove URL fragments", () => {
      const url = "https://example.com/docs#section-1";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("https://example.com/docs");
    });

    it("should remove both query params and fragments", () => {
      const url = "https://example.com/page?id=123#top";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("https://example.com/page");
    });

    it("should remove trailing slashes", () => {
      const url = "https://example.com/blog/";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("https://example.com/blog");
    });

    it("should handle root URLs correctly", () => {
      const url = "https://example.com/";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("https://example.com/");
    });

    it("should preserve the pathname", () => {
      const url = "https://github.com/user/repo/blob/main/README.md";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe(
        "https://github.com/user/repo/blob/main/README.md",
      );
    });

    it("should handle invalid URLs gracefully", () => {
      const url = "not-a-valid-url";
      const normalized = UrlUtils.normalizeUrl(url);

      expect(normalized).toBe("not-a-valid-url");
    });
  });

  describe("generateEntityId", () => {
    it("should generate consistent IDs for the same URL", () => {
      const url = "https://github.com/anthropics/claude";
      const id1 = UrlUtils.generateEntityId(url);
      const id2 = UrlUtils.generateEntityId(url);

      expect(id1).toBe(id2);
    });

    it("should generate the same ID for URLs with different query params", () => {
      const url1 = "https://example.com/page?utm_source=twitter";
      const url2 = "https://example.com/page?utm_source=facebook";
      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      expect(id1).toBe(id2);
    });

    it("should generate the same ID for URLs with different fragments", () => {
      const url1 = "https://example.com/docs#section-1";
      const url2 = "https://example.com/docs#section-2";
      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      expect(id1).toBe(id2);
    });

    it("should generate different IDs for different paths", () => {
      const url1 = "https://example.com/page1";
      const url2 = "https://example.com/page2";
      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      expect(id1).not.toBe(id2);
    });

    it("should generate different IDs for different domains", () => {
      const url1 = "https://example.com/page";
      const url2 = "https://example.org/page";
      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      expect(id1).not.toBe(id2);
    });

    it("should format ID as domain-hash", () => {
      const url = "https://github.com/user/repo";
      const id = UrlUtils.generateEntityId(url);

      expect(id).toMatch(/^github-com-[a-f0-9]{6}$/);
    });

    it("should handle subdomains in ID", () => {
      const url = "https://api.github.com/users";
      const id = UrlUtils.generateEntityId(url);

      expect(id).toMatch(/^api-github-com-[a-f0-9]{6}$/);
    });

    it("should handle invalid URLs with hash fallback", () => {
      const url = "not-a-valid-url";
      const id = UrlUtils.generateEntityId(url);

      expect(id).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  describe("isValidUrl", () => {
    it("should validate HTTP URLs", () => {
      expect(UrlUtils.isValidUrl("http://example.com")).toBe(true);
    });

    it("should validate HTTPS URLs", () => {
      expect(UrlUtils.isValidUrl("https://example.com")).toBe(true);
    });

    it("should reject FTP URLs", () => {
      expect(UrlUtils.isValidUrl("ftp://files.com")).toBe(false);
    });

    it("should reject file URLs", () => {
      expect(UrlUtils.isValidUrl("file:///path/to/file")).toBe(false);
    });

    it("should reject invalid URLs", () => {
      expect(UrlUtils.isValidUrl("not a url")).toBe(false);
      expect(UrlUtils.isValidUrl("example.com")).toBe(false);
      expect(UrlUtils.isValidUrl("//example.com")).toBe(false);
    });

    it("should validate complex URLs", () => {
      expect(
        UrlUtils.isValidUrl(
          "https://user:pass@example.com:8080/path?query=1#hash",
        ),
      ).toBe(true);
    });
  });
});
