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
  approach: [
    {
      title: "Pick Your Brain",
      description: "Choose a brain model matched to your context",
    },
    {
      title: "Add What You Need",
      description: "Every brain is built from plugins",
    },
    {
      title: "Own Everything",
      description: "All your content lives as plain markdown files",
    },
  ],
  productsIntro: "Each brain model is tailored for a specific use case.",
  technologies: [
    {
      title: "Plain Text Storage",
      description: "Plain text files you can read, move, and version",
    },
    {
      title: "AI-Native",
      description: "Built from the ground up with AI at the core",
    },
    {
      title: "Matrix Protocol",
      description: "Decentralized real-time communication",
    },
  ],
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
    heading: "Ready to think better?",
    buttonText: "Learn More",
    link: "/about",
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
      expect(result.approach).toHaveLength(3);
      expect(result.technologies).toHaveLength(3);
      expect(result.benefits).toHaveLength(2);
      expect(result.cta.heading).toBe("Ready to think better?");
      expect(result.cta.buttonText).toBe("Learn More");
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
    expect(markdown).toContain("## How It Works");
    expect(markdown).toContain("Pick Your Brain");
    expect(markdown).toContain("## Brain Models");
    expect(markdown).toContain("tailored for a specific use case");
    expect(markdown).toContain("## Built With");
    expect(markdown).toContain("Plain Text Storage");
    expect(markdown).toContain("## Why Brains");
    expect(markdown).toContain("Own Your Data");
    expect(markdown).toContain("## Ready to Build");
    expect(markdown).toContain("Ready to think better?");
    expect(markdown).toContain("Learn More");
  });

  it("should parse markdown back to body data", () => {
    const markdown = formatter.format(sampleBody);
    const parsed = formatter.parse(markdown);

    expect(parsed.vision).toContain("knowledge work");
    expect(parsed.pillars).toHaveLength(2);
    expect(parsed.pillars[0]?.title).toBe("AI-Native");
    expect(parsed.pillars[1]?.title).toBe("Plugin-Based");
    expect(parsed.approach).toHaveLength(3);
    expect(parsed.approach[0]?.title).toBe("Pick Your Brain");
    expect(parsed.technologies).toHaveLength(3);
    expect(parsed.technologies[0]?.title).toBe("Plain Text Storage");
    expect(parsed.benefits[0]?.title).toBe("Own Your Data");
    expect(parsed.cta.heading).toBe("Ready to think better?");
    expect(parsed.cta.buttonText).toBe("Learn More");
    expect(parsed.cta.link).toBe("/about");
  });

  it("should roundtrip format → parse → format", () => {
    const markdown1 = formatter.format(sampleBody);
    const parsed = formatter.parse(markdown1);
    const markdown2 = formatter.format(parsed);

    expect(markdown1).toBe(markdown2);
  });
});
