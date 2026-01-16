import { describe, it, expect } from "bun:test";
import {
  socialMetricsMetadataSchema,
  socialMetricsSchema,
  createSocialMetricsEntity,
  type SocialMetricsMetadata,
} from "../src/schemas/social-metrics";

describe("Social Metrics Schema", () => {
  describe("socialMetricsMetadataSchema", () => {
    it("should validate complete metadata", () => {
      const metadata: SocialMetricsMetadata = {
        platform: "linkedin",
        entityId: "social-post-my-post",
        platformPostId: "urn:li:ugcPost:7123456789",
        snapshotDate: "2025-01-15T10:00:00.000Z",
        impressions: 5000,
        likes: 150,
        comments: 25,
        shares: 10,
        engagementRate: 0.037,
      };

      const result = socialMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should accept linkedin platform", () => {
      const metadata = {
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        snapshotDate: "2025-01-15T10:00:00.000Z",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        engagementRate: 0.13,
      };

      const result = socialMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it("should reject invalid platform", () => {
      const metadata = {
        platform: "twitter",
        entityId: "social-post-test",
        platformPostId: "123456",
        snapshotDate: "2025-01-15T10:00:00.000Z",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        engagementRate: 0.13,
      };

      const result = socialMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it("should require all engagement fields", () => {
      const incompleteMetadata = {
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        snapshotDate: "2025-01-15T10:00:00.000Z",
        impressions: 100,
        // missing: likes, comments, shares, engagementRate
      };

      const result = socialMetricsMetadataSchema.safeParse(incompleteMetadata);
      expect(result.success).toBe(false);
    });

    it("should validate snapshotDate as datetime", () => {
      const metadata = {
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        snapshotDate: "not-a-date",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        engagementRate: 0.13,
      };

      const result = socialMetricsMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe("socialMetricsSchema", () => {
    it("should validate complete entity", () => {
      const entity = {
        id: "social-metrics-urn-li-ugcPost-123",
        entityType: "social-metrics",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          platform: "linkedin",
          entityId: "social-post-test",
          platformPostId: "urn:li:ugcPost:123",
          snapshotDate: "2025-01-15T10:00:00.000Z",
          impressions: 5000,
          likes: 150,
          comments: 25,
          shares: 10,
          engagementRate: 0.037,
        },
      };

      const result = socialMetricsSchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it("should enforce entityType literal", () => {
      const entity = {
        id: "social-metrics-urn-li-ugcPost-123",
        entityType: "wrong-type",
        content: "",
        contentHash: "abc123",
        created: "2025-01-15T10:00:00.000Z",
        updated: "2025-01-15T10:00:00.000Z",
        metadata: {
          platform: "linkedin",
          entityId: "social-post-test",
          platformPostId: "urn:li:ugcPost:123",
          snapshotDate: "2025-01-15T10:00:00.000Z",
          impressions: 100,
          likes: 10,
          comments: 2,
          shares: 1,
          engagementRate: 0.13,
        },
      };

      const result = socialMetricsSchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  describe("createSocialMetricsEntity", () => {
    it("should create entity with generated id", () => {
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-my-post",
        platformPostId: "urn:li:ugcPost:7123456789",
        impressions: 5000,
        likes: 150,
        comments: 25,
        shares: 10,
      });

      expect(entity.id).toMatch(/^social-metrics-/);
      expect(entity.entityType).toBe("social-metrics");
      expect(entity.metadata.platform).toBe("linkedin");
      expect(entity.metadata.impressions).toBe(5000);
    });

    it("should compute engagementRate correctly", () => {
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        impressions: 1000,
        likes: 50,
        comments: 10,
        shares: 5,
      });

      // engagementRate = (likes + comments + shares) / impressions
      // = (50 + 10 + 5) / 1000 = 0.065
      expect(entity.metadata.engagementRate).toBe(0.065);
    });

    it("should handle zero impressions in engagementRate", () => {
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      });

      expect(entity.metadata.engagementRate).toBe(0);
    });

    it("should set snapshotDate to current time", () => {
      const beforeCreate = new Date().toISOString();
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
      });
      const afterCreate = new Date().toISOString();

      expect(entity.metadata.snapshotDate >= beforeCreate).toBe(true);
      expect(entity.metadata.snapshotDate <= afterCreate).toBe(true);
    });

    it("should set created and updated timestamps", () => {
      const beforeCreate = new Date().toISOString();
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:123",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
      });
      const afterCreate = new Date().toISOString();

      expect(entity.created >= beforeCreate).toBe(true);
      expect(entity.created <= afterCreate).toBe(true);
      expect(entity.updated).toBe(entity.created);
    });

    it("should sanitize platformPostId for id", () => {
      const entity = createSocialMetricsEntity({
        platform: "linkedin",
        entityId: "social-post-test",
        platformPostId: "urn:li:ugcPost:7123456789",
        impressions: 100,
        likes: 10,
        comments: 2,
        shares: 1,
      });

      // Colons should be replaced with hyphens in id
      expect(entity.id).toBe("social-metrics-urn-li-ugcPost-7123456789");
    });
  });
});
