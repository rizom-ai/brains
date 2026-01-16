import { describe, it, expect } from "bun:test";
import {
  websiteMetricsMetadataSchema,
  websiteMetricsSchema,
  createWebsiteMetricsEntity,
  type WebsiteMetricsMetadata,
} from "../src/schemas/website-metrics";

describe("Website Metrics Schema", () => {
  describe("websiteMetricsMetadataSchema", () => {
    it("should validate complete metadata", () => {
      const metadata: WebsiteMetricsMetadata = {
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
        visits: 600,
        bounces: 180,
        totalTime: 27000,
        bounceRate: 0.3,
        avgTimeOnPage: 45,
      };

      const result = websiteMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should accept all period types", () => {
      const periods = ["daily", "weekly", "monthly"] as const;

      for (const period of periods) {
        const metadata = {
          period,
          startDate: "2025-01-15",
          endDate: "2025-01-15",
          pageviews: 100,
          visitors: 50,
          visits: 60,
          bounces: 10,
          totalTime: 1000,
          bounceRate: 0.17,
          avgTimeOnPage: 20,
        };

        const result = websiteMetricsMetadataSchema.safeParse(metadata);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid period", () => {
      const metadata = {
        period: "hourly",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        visits: 60,
        bounces: 10,
        totalTime: 1000,
        bounceRate: 0.17,
        avgTimeOnPage: 20,
      };

      const result = websiteMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("should require all metrics fields", () => {
      const incompleteMetadata = {
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 100,
        // missing: visitors, visits, bounces, totalTime, bounceRate, avgTimeOnPage
      };

      const result = websiteMetricsMetadataSchema.safeParse(incompleteMetadata);
      expect(result.success).toBe(false);
    });
  });

  describe("websiteMetricsSchema", () => {
    it("should validate complete entity", () => {
      const entity = {
        id: "website-metrics-daily-2025-01-15",
        entityType: "website-metrics",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          period: "daily",
          startDate: "2025-01-15",
          endDate: "2025-01-15",
          pageviews: 1500,
          visitors: 450,
          visits: 600,
          bounces: 180,
          totalTime: 27000,
          bounceRate: 0.3,
          avgTimeOnPage: 45,
        },
      };

      const result = websiteMetricsSchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it("should enforce entityType literal", () => {
      const entity = {
        id: "website-metrics-daily-2025-01-15",
        entityType: "wrong-type",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          period: "daily",
          startDate: "2025-01-15",
          endDate: "2025-01-15",
          pageviews: 100,
          visitors: 50,
          visits: 60,
          bounces: 10,
          totalTime: 1000,
          bounceRate: 0.17,
          avgTimeOnPage: 20,
        },
      };

      const result = websiteMetricsSchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  describe("createWebsiteMetricsEntity", () => {
    it("should create entity with generated id", () => {
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 1500,
        visitors: 450,
        visits: 600,
        bounces: 180,
        totalTime: 27000,
      });

      expect(entity.id).toBe("website-metrics-daily-2025-01-15");
      expect(entity.entityType).toBe("website-metrics");
      expect(entity.metadata.period).toBe("daily");
      expect(entity.metadata.pageviews).toBe(1500);
    });

    it("should compute bounceRate correctly", () => {
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 1000,
        visitors: 500,
        visits: 600,
        bounces: 180,
        totalTime: 18000,
      });

      expect(entity.metadata.bounceRate).toBe(0.3); // 180/600
    });

    it("should compute avgTimeOnPage correctly", () => {
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 1000,
        visitors: 500,
        visits: 600,
        bounces: 180,
        totalTime: 18000,
      });

      expect(entity.metadata.avgTimeOnPage).toBe(18); // 18000/1000
    });

    it("should handle zero pageviews in avgTimeOnPage", () => {
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 0,
        visitors: 0,
        visits: 0,
        bounces: 0,
        totalTime: 0,
      });

      expect(entity.metadata.avgTimeOnPage).toBe(0);
    });

    it("should handle zero visits in bounceRate", () => {
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 0,
        visitors: 0,
        visits: 0,
        bounces: 0,
        totalTime: 0,
      });

      expect(entity.metadata.bounceRate).toBe(0);
    });

    it("should generate weekly id format", () => {
      const entity = createWebsiteMetricsEntity({
        period: "weekly",
        startDate: "2025-01-13",
        endDate: "2025-01-19",
        pageviews: 5000,
        visitors: 1500,
        visits: 2000,
        bounces: 500,
        totalTime: 90000,
      });

      expect(entity.id).toBe("website-metrics-weekly-2025-01-13");
    });

    it("should set created and updated timestamps", () => {
      const beforeCreate = new Date().toISOString();
      const entity = createWebsiteMetricsEntity({
        period: "daily",
        startDate: "2025-01-15",
        endDate: "2025-01-15",
        pageviews: 100,
        visitors: 50,
        visits: 60,
        bounces: 10,
        totalTime: 1000,
      });
      const afterCreate = new Date().toISOString();

      expect(entity.created >= beforeCreate).toBe(true);
      expect(entity.created <= afterCreate).toBe(true);
      expect(entity.updated).toBe(entity.created);
    });
  });
});
