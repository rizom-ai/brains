import { describe, it, expect } from "bun:test";
import { SiteInfoAdapter } from "../src/adapters/site-info-adapter";

describe("SiteInfoAdapter", () => {
  const adapter = new SiteInfoAdapter();

  it("should have entityType 'site-info'", () => {
    expect(adapter.entityType).toBe("site-info");
  });

  describe("createSiteInfoContent", () => {
    it("should create frontmatter content from params", () => {
      const content = adapter.createSiteInfoContent({
        title: "Test Site",
        description: "A test site",
      });

      expect(content).toContain("title: Test Site");
      expect(content).toContain("description: A test site");
    });

    it("should include CTA when provided", () => {
      const content = adapter.createSiteInfoContent({
        title: "Test",
        description: "Desc",
        cta: {
          heading: "Join us",
          buttonText: "Sign up",
          buttonLink: "/signup",
        },
      });

      expect(content).toContain("heading: Join us");
      expect(content).toContain("buttonText: Sign up");
    });
  });

  describe("parseSiteInfoBody", () => {
    it("should parse frontmatter to SiteInfoBody", () => {
      const content = "---\ntitle: My Site\ndescription: My description\n---\n";
      const body = adapter.parseSiteInfoBody(content);

      expect(body.title).toBe("My Site");
      expect(body.description).toBe("My description");
    });

    it("should parse optional fields", () => {
      const content =
        "---\ntitle: My Site\ndescription: Desc\ncopyright: © 2026\nthemeMode: dark\n---\n";
      const body = adapter.parseSiteInfoBody(content);

      expect(body.copyright).toBe("© 2026");
      expect(body.themeMode).toBe("dark");
    });
  });

  describe("toMarkdown", () => {
    it("preserves frontmatter fields present on disk when metadata is empty", () => {
      const entity = {
        id: "site-info" as const,
        entityType: "site-info" as const,
        content: "---\ntitle: Test\ndescription: Desc\n---\n",
        contentHash: "abc",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const output = adapter.toMarkdown(entity);
      expect(output).toContain("title: Test");
      expect(output).toContain("description: Desc");
    });
  });

  describe("fromMarkdown", () => {
    it("should set entityType to site-info", () => {
      const result = adapter.fromMarkdown(
        "---\ntitle: Test\ndescription: Desc\n---\n",
      );

      expect(result.entityType).toBe("site-info");
      expect(result.content).toBeDefined();
    });
  });
});
