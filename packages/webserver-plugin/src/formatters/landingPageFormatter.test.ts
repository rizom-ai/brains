import { describe, it, expect } from "bun:test";
import { LandingPageFormatter } from "./landingPageFormatter";
import type { LandingPageData } from "../content-schemas";

describe("LandingPageFormatter", () => {
  const formatter = new LandingPageFormatter();

  const sampleData: LandingPageData = {
    title: "My Personal Knowledge System",
    tagline: "Where thoughts become insights",
    hero: {
      headline: "Welcome to Your Digital Brain",
      subheadline:
        "Organize, connect, and expand your knowledge with AI-powered intelligence.",
      ctaText: "Get Started",
      ctaLink: "/dashboard",
    },
  };

  describe("format", () => {
    it("should format data into structured markdown", () => {
      const result = formatter.format(sampleData);

      expect(result).toContain("# Landing Page Configuration");
      expect(result).toContain("## Title\nMy Personal Knowledge System");
      expect(result).toContain("## Tagline\nWhere thoughts become insights");
      expect(result).toContain("## Hero");
      expect(result).toContain("### Headline\nWelcome to Your Digital Brain");
      expect(result).toContain(
        "### Subheadline\nOrganize, connect, and expand your knowledge with AI-powered intelligence.",
      );
      expect(result).toContain("### CTA Text\nGet Started");
      expect(result).toContain("### CTA Link\n/dashboard");
    });
  });

  describe("parse", () => {
    it("should parse structured markdown back to data", () => {
      const markdown = formatter.format(sampleData);
      const result = formatter.parse(markdown);

      expect(result).toEqual(sampleData);
    });

    it("should handle multiline content", () => {
      const markdown = `# Landing Page Configuration

## Title
My Personal Knowledge System

## Tagline
Where thoughts become insights, powered by AI

## Hero
### Headline
Welcome to Your Digital Brain

### Subheadline
Organize, connect, and expand your knowledge 
with AI-powered intelligence and smart features.

### CTA Text
Get Started Now

### CTA Link
/get-started
`;

      const result = formatter.parse(markdown);

      expect(result.title).toBe("My Personal Knowledge System");
      expect(result.tagline).toBe(
        "Where thoughts become insights, powered by AI",
      );
      expect(result.hero.headline).toBe("Welcome to Your Digital Brain");
      expect(result.hero.subheadline).toBe(
        "Organize, connect, and expand your knowledge\nwith AI-powered intelligence and smart features.",
      );
      expect(result.hero.ctaText).toBe("Get Started Now");
      expect(result.hero.ctaLink).toBe("/get-started");
    });

    it("should throw error for missing sections", () => {
      const invalidMarkdown = `# Landing Page Configuration

## Title
My Site

## Tagline
Cool site
`;

      // Should throw Zod validation error for missing hero field
      expect(() => formatter.parse(invalidMarkdown)).toThrow();
      
      try {
        formatter.parse(invalidMarkdown);
      } catch (error) {
        // Verify it's complaining about the hero field
        expect(String(error)).toContain("hero");
        expect(String(error)).toContain("Required");
      }
    });

    it("should throw error for missing subsections", () => {
      const invalidMarkdown = `# Landing Page Configuration

## Title
My Site

## Tagline
Cool site

## Hero
### Headline
Welcome
`;

      // Should throw Zod validation error for missing hero subfields
      expect(() => formatter.parse(invalidMarkdown)).toThrow();
      
      try {
        formatter.parse(invalidMarkdown);
      } catch (error) {
        // Verify it's complaining about missing hero fields
        expect(String(error)).toContain("subheadline");
        expect(String(error)).toContain("Required");
      }
    });

    it("should validate parsed data against schema", () => {
      const invalidMarkdown = `# Landing Page Configuration

## Title


## Tagline
Cool site

## Hero
### Headline
Welcome

### Subheadline
Test

### CTA Text
Go

### CTA Link
/test
`;

      // Should NOT throw - empty string is valid for title
      const result = formatter.parse(invalidMarkdown);
      expect(result.title).toBe("");
      expect(result.tagline).toBe("Cool site");
    });
  });

  describe("roundtrip", () => {
    it("should maintain data integrity through format/parse cycle", () => {
      const formatted = formatter.format(sampleData);
      const parsed = formatter.parse(formatted);
      const reformatted = formatter.format(parsed);

      expect(parsed).toEqual(sampleData);
      expect(reformatted).toBe(formatted);
    });

    it("should handle complex multiline content", () => {
      const complexData: LandingPageData = {
        title: "Enterprise Knowledge Platform",
        tagline: "Transform your organization's collective intelligence",
        hero: {
          headline: "The Future of Knowledge Management",
          subheadline:
            "Harness the power of AI to organize, discover, and share knowledge across your entire organization with unprecedented efficiency.",
          ctaText: "Start Your Free Trial",
          ctaLink: "/signup?plan=enterprise",
        },
      };

      const formatted = formatter.format(complexData);
      const parsed = formatter.parse(formatted);

      expect(parsed).toEqual(complexData);
    });
  });
});
