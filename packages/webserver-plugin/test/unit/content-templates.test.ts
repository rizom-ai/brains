import { describe, it, expect } from "bun:test";
import {
  heroSectionTemplate,
  featuresSectionTemplate,
  ctaSectionTemplate,
  landingPageTemplate,
  dashboardTemplate,
  webserverContentTemplates,
} from "../../src/content-templates";

describe("Content Templates", () => {
  describe("heroSectionTemplate", () => {
    it("should have correct structure", () => {
      expect(heroSectionTemplate.name).toBe("hero-section");
      expect(heroSectionTemplate.description).toBe("Hero section for pages");
      expect(heroSectionTemplate.schema).toBeDefined();
      expect(heroSectionTemplate.basePrompt).toContain("hero section");
    });

    it("should have valid schema", () => {
      const testData = {
        headline: "Test Headline",
        subheadline: "Test Subheadline",
        ctaText: "Get Started",
        ctaLink: "/dashboard",
      };

      const result = heroSectionTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("featuresSectionTemplate", () => {
    it("should have correct structure", () => {
      expect(featuresSectionTemplate.name).toBe("features-section");
      expect(featuresSectionTemplate.description).toBe(
        "Features section for pages",
      );
      expect(featuresSectionTemplate.schema).toBeDefined();
      expect(featuresSectionTemplate.basePrompt).toContain("features section");
    });

    it("should have valid schema", () => {
      const testData = {
        label: "Features",
        headline: "Our Features",
        description: "Feature description",
        features: [
          {
            icon: "check",
            title: "Feature 1",
            description: "Description 1",
          },
        ],
      };

      const result = featuresSectionTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("ctaSectionTemplate", () => {
    it("should have correct structure", () => {
      expect(ctaSectionTemplate.name).toBe("cta-section");
      expect(ctaSectionTemplate.description).toBe(
        "Call-to-action section for pages",
      );
      expect(ctaSectionTemplate.schema).toBeDefined();
      expect(ctaSectionTemplate.basePrompt).toContain("call-to-action section");
    });

    it("should have valid schema", () => {
      const testData = {
        headline: "Ready to start?",
        description: "Join us today",
        primaryButton: {
          text: "Get Started",
          link: "/signup",
        },
      };

      const result = ctaSectionTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("landingPageTemplate", () => {
    it("should have correct structure", () => {
      expect(landingPageTemplate.name).toBe("landing-page");
      expect(landingPageTemplate.description).toBe(
        "Landing page configuration with section references",
      );
      expect(landingPageTemplate.schema).toBeDefined();
      expect(landingPageTemplate.basePrompt).toContain("landing page");
    });

    it("should have valid schema with references", () => {
      const testData = {
        title: "My Brain",
        tagline: "Knowledge Management",
        heroId: "hero-section-1",
        featuresId: "features-section-1",
        ctaId: "cta-section-1",
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

    it("should have valid schema", () => {
      const testData = {
        title: "Dashboard",
        description: "Your knowledge overview",
        stats: {
          entityCount: 42,
          entityTypeCount: 5,
          lastUpdated: new Date().toISOString(),
        },
        recentEntities: [],
      };

      const result = dashboardTemplate.schema.parse(testData);
      expect(result).toEqual(testData);
    });
  });

  describe("webserverContentTemplates", () => {
    it("should include all templates", () => {
      expect(webserverContentTemplates).toHaveLength(5);
      const names = webserverContentTemplates.map((t) => t.name);
      expect(names).toContain("hero-section");
      expect(names).toContain("features-section");
      expect(names).toContain("cta-section");
      expect(names).toContain("landing-page");
      expect(names).toContain("dashboard");
    });
  });
});
