import { describe, it, expect } from "bun:test";
import {
  overviewFrontmatterSchema,
  overviewBodySchema,
  overviewSchema,
  type OverviewBody,
} from "../src/schemas/overview";
import { OverviewBodyFormatter } from "../src/formatters/overview-formatter";
import { createTestEntity } from "@brains/test-utils";

const sampleBody: OverviewBody = {
  vision:
    "We believe knowledge work deserves better tools. The Brains platform provides AI-native models that adapt to how you think and work.",
  pillars: [
    {
      title: "AI-Native",
      description: "Built from the ground up with AI at the core",
    },
    {
      title: "Plugin-Based",
      description: "Extensible architecture that adapts to your workflow",
    },
  ],
  productsIntro: "Each brain model is tailored for a specific use case.",
  technologies: ["TypeScript", "Preact", "Drizzle ORM", "Matrix Protocol"],
  benefits: [
    {
      title: "Own Your Data",
      description: "All content stored as markdown — portable, readable, yours",
    },
    {
      title: "Extend Everything",
      description: "Plugin system makes every brain customizable",
    },
  ],
  cta: {
    text: "Get Started",
    link: "/docs/getting-started",
  },
};

describe("Overview Schemas", () => {
  describe("overviewFrontmatterSchema", () => {
    it("should validate valid frontmatter", () => {
      const data = {
        headline: "What We Build",
        tagline: "Brain models for every use case",
      };
      const result = overviewFrontmatterSchema.parse(data);
      expect(result.headline).toBe("What We Build");
      expect(result.tagline).toBe("Brain models for every use case");
    });

    it("should reject missing fields", () => {
      expect(() => overviewFrontmatterSchema.parse({})).toThrow();
      expect(() =>
        overviewFrontmatterSchema.parse({ headline: "test" }),
      ).toThrow();
    });
  });

  describe("overviewBodySchema", () => {
    it("should validate valid body data", () => {
      const result = overviewBodySchema.parse(sampleBody);
      expect(result.vision).toContain("knowledge work");
      expect(result.pillars).toHaveLength(2);
      expect(result.technologies).toHaveLength(4);
      expect(result.benefits).toHaveLength(2);
      expect(result.cta.text).toBe("Get Started");
    });

    it("should require at least one pillar", () => {
      expect(() =>
        overviewBodySchema.parse({ ...sampleBody, pillars: [] }),
      ).toThrow();
    });

    it("should require at least one benefit", () => {
      expect(() =>
        overviewBodySchema.parse({ ...sampleBody, benefits: [] }),
      ).toThrow();
    });

    it("should require at least one technology", () => {
      expect(() =>
        overviewBodySchema.parse({ ...sampleBody, technologies: [] }),
      ).toThrow();
    });
  });

  describe("overviewSchema", () => {
    it("should validate full overview entity", () => {
      const entity = createTestEntity("products-overview", {
        metadata: {
          headline: "What We Build",
          slug: "overview",
        },
      });
      const result = overviewSchema.parse(entity);
      expect(result.entityType).toBe("products-overview");
      expect(result.metadata.headline).toBe("What We Build");
    });
  });
});

describe("OverviewBodyFormatter", () => {
  const formatter = new OverviewBodyFormatter();

  it("should format body data to markdown", () => {
    const markdown = formatter.format(sampleBody);

    expect(markdown).toContain("## Vision");
    expect(markdown).toContain("knowledge work");
    expect(markdown).toContain("## Core Principles");
    expect(markdown).toContain("AI-Native");
    expect(markdown).toContain("Plugin-Based");
    expect(markdown).toContain("## Brain Models");
    expect(markdown).toContain("tailored for a specific use case");
    expect(markdown).toContain("## Built With");
    expect(markdown).toContain("TypeScript");
    expect(markdown).toContain("## Why Brains");
    expect(markdown).toContain("Own Your Data");
    expect(markdown).toContain("## Ready to Build");
    expect(markdown).toContain("Get Started");
  });

  it("should parse markdown back to body data", () => {
    const markdown = formatter.format(sampleBody);
    const parsed = formatter.parse(markdown);

    expect(parsed.vision).toContain("knowledge work");
    expect(parsed.pillars).toHaveLength(2);
    expect(parsed.pillars[0]?.title).toBe("AI-Native");
    expect(parsed.pillars[1]?.title).toBe("Plugin-Based");
    expect(parsed.technologies).toContain("TypeScript");
    expect(parsed.technologies).toContain("Drizzle ORM");
    expect(parsed.benefits[0]?.title).toBe("Own Your Data");
    expect(parsed.cta.text).toBe("Get Started");
    expect(parsed.cta.link).toBe("/docs/getting-started");
  });

  it("should roundtrip format → parse → format", () => {
    const markdown1 = formatter.format(sampleBody);
    const parsed = formatter.parse(markdown1);
    const markdown2 = formatter.format(parsed);

    expect(markdown1).toBe(markdown2);
  });
});
