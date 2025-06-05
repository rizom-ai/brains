import { describe, it, expect } from "bun:test";
import {
  landingHeroTemplate,
  landingPageTemplate,
  dashboardTemplate,
  webserverContentTemplates,
} from "../../src/content-templates";

describe("Content Templates", () => {
  describe("landingHeroTemplate", () => {
    it("should have correct structure", () => {
      expect(landingHeroTemplate.name).toBe("landing-hero");
      expect(landingHeroTemplate.description).toBe(
        "Hero section for landing page",
      );
      expect(landingHeroTemplate.schema).toBeDefined();
      expect(landingHeroTemplate.basePrompt).toContain("hero section");
    });

    it("should have valid schema", () => {
      const testData = {
        headline: "Test Headline",
        subheadline: "Test Subheadline",
        ctaText: "Get Started",
        ctaLink: "/dashboard",
      };

      const result = landingHeroTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("landingPageTemplate", () => {
    it("should have correct structure", () => {
      expect(landingPageTemplate.name).toBe("landing-page");
      expect(landingPageTemplate.description).toBe(
        "Complete landing page content",
      );
      expect(landingPageTemplate.schema).toBeDefined();
      expect(landingPageTemplate.basePrompt).toContain("landing page");
    });

    it("should have valid schema with nested hero", () => {
      const testData = {
        title: "My Brain",
        tagline: "Knowledge Management",
        hero: {
          headline: "Welcome",
          subheadline: "Your personal knowledge hub",
          ctaText: "Explore",
          ctaLink: "/dashboard",
        },
      };

      const result = landingPageTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("dashboardTemplate", () => {
    it("should have correct structure", () => {
      expect(dashboardTemplate.name).toBe("dashboard");
      expect(dashboardTemplate.description).toBe(
        "Dashboard page content with statistics",
      );
      expect(dashboardTemplate.schema).toBeDefined();
      expect(dashboardTemplate.basePrompt).toContain("dashboard");
    });

    it("should have valid schema with stats and entities", () => {
      const testData = {
        title: "Dashboard",
        description: "Your knowledge overview",
        stats: {
          entityCount: 42,
          entityTypeCount: 3,
          lastUpdated: new Date().toISOString(),
        },
        recentEntities: [
          {
            id: "1",
            title: "Recent Note",
            created: new Date().toISOString(),
          },
        ],
      };

      const result = dashboardTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("webserverContentTemplates", () => {
    it("should export all templates", () => {
      expect(webserverContentTemplates).toHaveLength(3);
      expect(webserverContentTemplates).toContain(landingHeroTemplate);
      expect(webserverContentTemplates).toContain(landingPageTemplate);
      expect(webserverContentTemplates).toContain(dashboardTemplate);
    });

    it("should have unique template names", () => {
      const names = webserverContentTemplates.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
