import { describe, it, expect } from "bun:test";
import { LandingPageFormatter } from "./landingPageFormatter";
import type { LandingPageReferenceData } from "../content-schemas";

describe("LandingPageFormatter", () => {
  const formatter = new LandingPageFormatter();

  const sampleData: LandingPageReferenceData = {
    title: "My Personal Knowledge System",
    tagline: "Where thoughts become insights",
    heroId: "hero-section-personal-brain",
    featuresId: "features-section-personal-brain",
    ctaId: "cta-section-personal-brain",
  };

  describe("format", () => {
    it("should format data into YAML with references", () => {
      const result = formatter.format(sampleData);

      expect(result).toContain("# Landing Page Configuration");
      expect(result).toContain("```yaml");
      expect(result).toContain("title: My Personal Knowledge System");
      expect(result).toContain("tagline: Where thoughts become insights");
      expect(result).toContain("heroId: hero-section-personal-brain");
      expect(result).toContain("featuresId: features-section-personal-brain");
      expect(result).toContain("ctaId: cta-section-personal-brain");
      expect(result).toContain("This page references the following sections:");
      expect(result).toContain("- Hero: hero-section-personal-brain");
      expect(result).toContain("- Features: features-section-personal-brain");
      expect(result).toContain("- CTA: cta-section-personal-brain");
    });
  });

  describe("parse", () => {
    it("should parse YAML back to reference data", () => {
      const markdown = formatter.format(sampleData);
      const parsed = formatter.parse(markdown);

      expect(parsed).toEqual(sampleData);
    });

    it("should handle markdown with extra content", () => {
      const markdown = `# Landing Page Configuration

\`\`\`yaml
title: Test Title
tagline: Test Tagline
heroId: hero-test
featuresId: features-test
ctaId: cta-test
\`\`\`

Some extra content that should be ignored.`;

      const result = formatter.parse(markdown);

      expect(result.title).toBe("Test Title");
      expect(result.tagline).toBe("Test Tagline");
      expect(result.heroId).toBe("hero-test");
      expect(result.featuresId).toBe("features-test");
      expect(result.ctaId).toBe("cta-test");
    });

    it("should throw error for invalid YAML", () => {
      const markdown = `# Landing Page Configuration

\`\`\`yaml
invalid: yaml: content
\`\`\``;

      expect(() => formatter.parse(markdown)).toThrow();
    });
  });
});