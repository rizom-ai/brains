import { describe, it, expect } from "bun:test";
import {
  newsletterSchema,
  newsletterMetadataSchema,
  createNewsletter,
} from "../src/schemas/newsletter";

describe("Newsletter Schema", () => {
  describe("newsletterMetadataSchema", () => {
    it("should require subject", () => {
      const result = newsletterMetadataSchema.safeParse({
        status: "draft",
      });
      expect(result.success).toBe(false);
    });

    it("should require status", () => {
      const result = newsletterMetadataSchema.safeParse({
        subject: "Test Subject",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid metadata", () => {
      const result = newsletterMetadataSchema.safeParse({
        subject: "Weekly Update",
        status: "draft",
      });
      expect(result.success).toBe(true);
    });

    it("should accept optional entityIds", () => {
      const result = newsletterMetadataSchema.safeParse({
        subject: "Weekly Update",
        status: "draft",
        entityIds: ["post-1", "deck-2"],
      });
      expect(result.success).toBe(true);
      expect(result.data?.entityIds).toEqual(["post-1", "deck-2"]);
    });

    it("should accept optional scheduledFor", () => {
      const result = newsletterMetadataSchema.safeParse({
        subject: "Scheduled Newsletter",
        status: "queued",
        scheduledFor: "2024-01-20T09:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("should validate status enum", () => {
      const validStatuses = ["draft", "queued", "sent", "failed"];
      for (const status of validStatuses) {
        const result = newsletterMetadataSchema.safeParse({
          subject: "Test",
          status,
        });
        expect(result.success).toBe(true);
      }

      const invalidResult = newsletterMetadataSchema.safeParse({
        subject: "Test",
        status: "invalid",
      });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("newsletterSchema", () => {
    it("should validate full newsletter entity", () => {
      const result = newsletterSchema.safeParse({
        id: "newsletter-2024-01-20",
        entityType: "newsletter",
        content: "# Hello\n\nThis is the newsletter content.",
        contentHash: "abc123",
        created: "2024-01-20T10:00:00Z",
        updated: "2024-01-20T10:00:00Z",
        metadata: {
          subject: "Weekly Update",
          status: "draft",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should require entityType to be newsletter", () => {
      const result = newsletterSchema.safeParse({
        id: "test",
        entityType: "post", // wrong type
        content: "",
        contentHash: "abc",
        created: "2024-01-20T10:00:00Z",
        updated: "2024-01-20T10:00:00Z",
        metadata: {
          subject: "Test",
          status: "draft",
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createNewsletter", () => {
    it("should create newsletter with defaults", () => {
      const newsletter = createNewsletter({
        subject: "Test Newsletter",
        content: "Hello world",
      });

      expect(newsletter.entityType).toBe("newsletter");
      expect(newsletter.metadata.subject).toBe("Test Newsletter");
      expect(newsletter.metadata.status).toBe("draft");
      expect(newsletter.content).toBe("Hello world");
      expect(newsletter.id).toBeDefined();
      expect(newsletter.created).toBeDefined();
    });

    it("should allow overriding defaults", () => {
      const newsletter = createNewsletter({
        subject: "Scheduled",
        content: "Content",
        status: "queued",
        scheduledFor: "2024-01-25T09:00:00Z",
        entityIds: ["post-1"],
      });

      expect(newsletter.metadata.status).toBe("queued");
      expect(newsletter.metadata.scheduledFor).toBe("2024-01-25T09:00:00Z");
      expect(newsletter.metadata.entityIds).toEqual(["post-1"]);
    });

    it("should generate slug-based id from subject", () => {
      const newsletter = createNewsletter({
        subject: "My Weekly Newsletter!",
        content: "Content",
      });

      expect(newsletter.id).toContain("my-weekly-newsletter");
    });
  });
});
