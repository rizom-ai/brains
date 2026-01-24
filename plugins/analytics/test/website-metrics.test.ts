import { describe, it, expect } from "bun:test";
import {
  websiteMetricsFrontmatterSchema,
  websiteMetricsMetadataSchema,
  websiteMetricsSchema,
  createWebsiteMetricsEntity,
  topPageSchema,
  topReferrerSchema,
  deviceBreakdownSchema,
  topCountrySchema,
  type WebsiteMetricsMetadata,
  type WebsiteMetricsFrontmatter,
} from "../src/schemas/website-metrics";

describe("Website Metrics Schema", () => {
  describe("breakdown schemas", () => {
    it("should validate topPageSchema", () => {
      const result = topPageSchema.safeParse({
        path: "/essays/test",
        views: 45,
      });
      expect(result.success).toBe(true);
    });

    it("should validate topReferrerSchema", () => {
      const result = topReferrerSchema.safeParse({
        host: "google.com",
        visits: 25,
      });
      expect(result.success).toBe(true);
    });

    it("should validate deviceBreakdownSchema", () => {
      const result = deviceBreakdownSchema.safeParse({
        desktop: 60,
        mobile: 38,
        tablet: 2,
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty deviceBreakdownSchema (all fields required)", () => {
      const result = deviceBreakdownSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should validate topCountrySchema", () => {
      const result = topCountrySchema.safeParse({
        country: "United States",
        visits: 40,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("websiteMetricsFrontmatterSchema", () => {
    it("should validate complete frontmatter with breakdowns", () => {
      const frontmatter: WebsiteMetricsFrontmatter = {
        date: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
        topPages: [
          { path: "/essays/economy-of-abundance", views: 45 },
          { path: "/", views: 30 },
        ],
        topReferrers: [
          { host: "google.com", visits: 25 },
          { host: "linkedin.com", visits: 15 },
        ],
        devices: { desktop: 60, mobile: 38, tablet: 2 },
        topCountries: [
          { country: "United States", visits: 40 },
          { country: "Netherlands", visits: 15 },
        ],
      };

      const result = websiteMetricsFrontmatterSchema.safeParse(frontmatter);
      expect(result.success).toBe(true);
    });

    it("should reject frontmatter missing required breakdown fields", () => {
      const frontmatter = {
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        // Missing: topPages, topReferrers, devices, topCountries
      };

      const result = websiteMetricsFrontmatterSchema.safeParse(frontmatter);
      expect(result.success).toBe(false);
    });

    it("should require date in ISO format", () => {
      const frontmatter = {
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        topPages: [],
        topReferrers: [],
        devices: { desktop: 0, mobile: 0, tablet: 0 },
        topCountries: [],
      };

      const result = websiteMetricsFrontmatterSchema.safeParse(frontmatter);
      expect(result.success).toBe(true);
    });
  });

  describe("websiteMetricsMetadataSchema", () => {
    it("should validate metadata (queryable subset of frontmatter)", () => {
      const metadata: WebsiteMetricsMetadata = {
        date: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
      };

      const result = websiteMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should NOT include breakdown arrays in metadata", () => {
      // Metadata should only have queryable fields, not large arrays
      const metadataWithBreakdowns = {
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        topPages: [{ path: "/test", views: 10 }], // Should be ignored
      };

      const result = websiteMetricsMetadataSchema.safeParse(
        metadataWithBreakdowns,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        // topPages should not be in the parsed result
        expect("topPages" in result.data).toBe(false);
      }
    });

    it("should require all core metrics fields", () => {
      const incompleteMetadata = {
        date: "2025-01-15",
        pageviews: 100,
        // missing: visitors
      };

      const result = websiteMetricsMetadataSchema.safeParse(incompleteMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("websiteMetricsSchema", () => {
    it("should validate entity with metadata only (no frontmatter field)", () => {
      // Breakdowns are stored in content as YAML, not as a separate field
      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "website-metrics",
        content: "---\ndate: 2025-01-15\n---\n",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
        },
      };

      const result = websiteMetricsSchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it("should NOT have frontmatter as a schema field", () => {
      // Verify frontmatter is NOT part of the entity schema
      // (it's parsed from content by the adapter when needed)
      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "website-metrics",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 100,
          visitors: 50,
        },
      };

      const result = websiteMetricsSchema.safeParse(entity);
      expect(result.success).toBe(true);
      if (result.success) {
        expect("frontmatter" in result.data).toBe(false);
      }
    });

    it("should enforce entityType literal", () => {
      const entity = {
        id: "website-metrics-2025-01-15",
        entityType: "wrong-type",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          date: "2025-01-15",
          pageviews: 100,
          visitors: 50,
        },
      };

      const result = websiteMetricsSchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  describe("createWebsiteMetricsEntity", () => {
    it("should create entity with generated id from date", () => {
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
      });

      expect(entity.id).toBe("website-metrics-2025-01-15");
      expect(entity.entityType).toBe("website-metrics");
      expect(entity.metadata.date).toBe("2025-01-15");
      expect(entity.metadata.pageviews).toBe(1500);
    });

    it("should store breakdowns in content as YAML frontmatter", () => {
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
        topPages: [
          { path: "/essays/economy-of-abundance", views: 45 },
          { path: "/", views: 30 },
        ],
        topReferrers: [{ host: "google.com", visits: 25 }],
        devices: { desktop: 60, mobile: 38, tablet: 2 },
        topCountries: [{ country: "United States", visits: 40 }],
      });

      // Breakdowns should be in content, not as separate field
      expect(entity.content).toContain("topPages:");
      expect(entity.content).toContain("/essays/economy-of-abundance");
      expect(entity.content).toContain("topReferrers:");
      expect(entity.content).toContain("google.com");
      expect(entity.content).toContain("devices:");
      expect(entity.content).toContain("desktop: 60");
      expect(entity.content).toContain("topCountries:");
      expect(entity.content).toContain("United States");

      // Entity should NOT have frontmatter field
      expect("frontmatter" in entity).toBe(false);
    });

    it("should only include queryable fields in metadata", () => {
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        topPages: [{ path: "/", views: 10 }],
      });

      // Metadata should only have queryable fields
      expect(entity.metadata).toEqual({
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
      });

      // topPages should NOT be in metadata
      expect("topPages" in entity.metadata).toBe(false);
    });

    it("should set created and updated timestamps", () => {
      const beforeCreate = new Date().toISOString();
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
      });
      const afterCreate = new Date().toISOString();

      expect(entity.created >= beforeCreate).toBe(true);
      expect(entity.created <= afterCreate).toBe(true);
      expect(entity.updated).toBe(entity.created);
    });

    it("should generate content hash", () => {
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
      });

      expect(entity.contentHash).toBeDefined();
      expect(entity.contentHash.length).toBeGreaterThan(0);
    });

    it("should include YAML frontmatter markers in content", () => {
      const entity = createWebsiteMetricsEntity({
        date: "2025-01-15",
        pageviews: 100,
        visitors: 50,
      });

      expect(entity.content).toMatch(/^---\n/);
      expect(entity.content).toContain("\n---\n");
    });
  });
});
