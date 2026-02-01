import { describe, it, expect } from "bun:test";
import {
  newsletterListSchema,
  newsletterListTemplate,
} from "../../src/templates/newsletter-list";

describe("Newsletter List Template", () => {
  describe("schema validation", () => {
    it("should validate valid list data", () => {
      const validData = {
        newsletters: [
          {
            id: "nl-1",
            subject: "Weekly Update",
            status: "published",
            excerpt: "This is a preview of the newsletter content...",
            created: "2025-01-01T10:00:00.000Z",
            sentAt: "2025-01-01T12:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with draft status", () => {
      const validData = {
        newsletters: [
          {
            id: "nl-1",
            subject: "Draft Newsletter",
            status: "draft",
            excerpt: "Preview text...",
            created: "2025-01-01T10:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with queued status", () => {
      const validData = {
        newsletters: [
          {
            id: "nl-1",
            subject: "Queued Newsletter",
            status: "queued",
            excerpt: "Preview text...",
            created: "2025-01-01T10:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate newsletter with failed status", () => {
      const validData = {
        newsletters: [
          {
            id: "nl-1",
            subject: "Failed Newsletter",
            status: "failed",
            excerpt: "Preview text...",
            created: "2025-01-01T10:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate empty list", () => {
      const validData = {
        newsletters: [],
        totalCount: 0,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should validate with pagination", () => {
      const validData = {
        newsletters: [],
        totalCount: 50,
        pagination: {
          currentPage: 1,
          totalPages: 5,
          totalItems: 50,
          pageSize: 10,
          hasNextPage: true,
          hasPrevPage: false,
        },
      };

      const result = newsletterListSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid status", () => {
      const invalidData = {
        newsletters: [
          {
            id: "nl-1",
            subject: "Invalid Newsletter",
            status: "invalid",
            excerpt: "Preview text...",
            created: "2025-01-01T10:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const invalidData = {
        newsletters: [
          {
            id: "nl-1",
            // missing subject
            status: "draft",
            excerpt: "Preview text...",
            created: "2025-01-01T10:00:00.000Z",
            url: "/newsletters/nl-1",
          },
        ],
        totalCount: 1,
        pagination: null,
      };

      const result = newsletterListSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("template definition", () => {
    it("should have correct name", () => {
      expect(newsletterListTemplate.name).toBe("newsletter-list");
    });

    it("should have a description", () => {
      expect(newsletterListTemplate.description).toBeDefined();
      expect(newsletterListTemplate.description.length).toBeGreaterThan(0);
    });

    it("should use newsletter entities datasource", () => {
      expect(newsletterListTemplate.dataSourceId).toBe("newsletter:entities");
    });

    it("should have public permission", () => {
      expect(newsletterListTemplate.requiredPermission).toBe("public");
    });

    it("should have a layout component", () => {
      expect(newsletterListTemplate.layout).toBeDefined();
      expect(newsletterListTemplate.layout?.component).toBeDefined();
    });
  });
});
