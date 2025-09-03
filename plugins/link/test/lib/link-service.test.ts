import { describe, it, expect } from "bun:test";
import { UrlUtils } from "../../src/lib/url-utils";

describe("LinkService", () => {
  describe("UrlUtils", () => {
    it("should generate deterministic entity IDs", () => {
      const url1 = "https://example.com/article";
      const url2 = "https://example.com/article?utm_source=twitter";

      const id1 = UrlUtils.generateEntityId(url1);
      const id2 = UrlUtils.generateEntityId(url2);

      // Should be deterministic
      expect(UrlUtils.generateEntityId(url1)).toBe(id1);
      // Should normalize URLs (remove tracking params)
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^example-com-[a-f0-9]{6}$/);
    });

    it("should handle different domains", () => {
      const githubUrl = "https://github.com/user/repo";
      const googleUrl = "https://google.com/search?q=test";

      const githubId = UrlUtils.generateEntityId(githubUrl);
      const googleId = UrlUtils.generateEntityId(googleUrl);

      expect(githubId).toMatch(/^github-com-[a-f0-9]{6}$/);
      expect(googleId).toMatch(/^google-com-[a-f0-9]{6}$/);
      expect(githubId).not.toBe(googleId);
    });
  });
});
