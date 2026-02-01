import { describe, it, expect } from "bun:test";
import {
  newsletterDetailSchema,
  newsletterDetailTemplate,
} from "../../src/templates/newsletter-detail";

describe("Newsletter Detail Template", () => {
  describe("schema validation", () => {
    it("should validate valid detail data", () => {
      const validData = {
        id: "nl-1",
        subject: "Weekly Update",
        status: "published",
        content:
          "# Full Newsletter Content\n\nThis is the complete newsletter...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
        sentAt: "2025-01-01T12:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate draft newsletter without sentAt", () => {
      const validData = {
        id: "nl-1",
        subject: "Draft Newsletter",
        status: "draft",
        content: "Draft content here...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with scheduledFor", () => {
      const validData = {
        id: "nl-1",
        subject: "Scheduled Newsletter",
        status: "queued",
        content: "Content here...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
        scheduledFor: "2025-01-15T10:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with source entities", () => {
      const validData = {
        id: "nl-1",
        subject: "Newsletter with Sources",
        status: "published",
        content: "Content referencing blog posts...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
        sentAt: "2025-01-01T12:00:00.000Z",
        sourceEntities: [
          {
            id: "post-1",
            title: "Blog Post 1",
            url: "/posts/blog-post-1",
          },
          {
            id: "post-2",
            title: "Blog Post 2",
            url: "/posts/blog-post-2",
          },
        ],
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with prev/next navigation", () => {
      const validData = {
        id: "nl-2",
        subject: "Middle Newsletter",
        status: "published",
        content: "Content here...",
        created: "2025-01-02T10:00:00.000Z",
        updated: "2025-01-02T11:00:00.000Z",
        sentAt: "2025-01-02T12:00:00.000Z",
        prevNewsletter: {
          id: "nl-3",
          subject: "Newer Newsletter",
          url: "/newsletters/nl-3",
        },
        nextNewsletter: {
          id: "nl-1",
          subject: "Older Newsletter",
          url: "/newsletters/nl-1",
        },
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter without navigation (single newsletter)", () => {
      const validData = {
        id: "nl-1",
        subject: "Only Newsletter",
        status: "published",
        content: "Content here...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
        sentAt: "2025-01-01T12:00:00.000Z",
        prevNewsletter: null,
        nextNewsletter: null,
      };

      const result = newsletterDetailSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid status", () => {
      const invalidData = {
        id: "nl-1",
        subject: "Invalid Newsletter",
        status: "invalid",
        content: "Content...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const invalidData = {
        id: "nl-1",
        // missing subject
        status: "draft",
        content: "Content...",
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing content", () => {
      const invalidData = {
        id: "nl-1",
        subject: "Newsletter",
        status: "draft",
        // missing content
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T11:00:00.000Z",
      };

      const result = newsletterDetailSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("template definition", () => {
    it("should have correct name", () => {
      expect(newsletterDetailTemplate.name).toBe("newsletter-detail");
    });

    it("should have a description", () => {
      expect(newsletterDetailTemplate.description).toBeDefined();
      expect(newsletterDetailTemplate.description.length).toBeGreaterThan(0);
    });

    it("should use newsletter entities datasource", () => {
      expect(newsletterDetailTemplate.dataSourceId).toBe("newsletter:entities");
    });

    it("should have public permission", () => {
      expect(newsletterDetailTemplate.requiredPermission).toBe("public");
    });

    it("should have a layout component", () => {
      expect(newsletterDetailTemplate.layout).toBeDefined();
      expect(newsletterDetailTemplate.layout?.component).toBeDefined();
    });
  });
});
