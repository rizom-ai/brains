import { describe, it, expect } from "bun:test";
import { contentRegistry } from "../../src/content/registry";
import { heroSectionTemplate } from "../../src/content/landing/hero";
import { featuresSectionTemplate } from "../../src/content/landing/features";
import { ctaSectionTemplate } from "../../src/content/landing/cta";
import { dashboardTemplate } from "../../src/content/dashboard/index";

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

  describe("contentRegistry", () => {
    it("should include all templates", () => {
      const keys = contentRegistry.getTemplateKeys();
      expect(keys).toContain("landing:hero");
      expect(keys).toContain("landing:features");
      expect(keys).toContain("landing:cta");
      expect(keys).toContain("landing:index");
      expect(keys).toContain("dashboard:index");
    });

    it("should retrieve templates correctly", () => {
      const hero = contentRegistry.getTemplate("landing:hero");
      expect(hero).toBe(heroSectionTemplate);

      const features = contentRegistry.getTemplate("landing:features");
      expect(features).toBe(featuresSectionTemplate);

      const cta = contentRegistry.getTemplate("landing:cta");
      expect(cta).toBe(ctaSectionTemplate);

      const dashboard = contentRegistry.getTemplate("dashboard:index");
      expect(dashboard).toBe(dashboardTemplate);
    });
  });
});
