import { describe, it, expect } from "bun:test";
import type { SiteContent } from "@brains/types";
import { compareContent, isContentEquivalent } from "./comparator";

describe("Content Comparator", () => {
  const contentA: SiteContent = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    content: "# Hero Section\n\nWelcome to our site!",
    pageId: "landing",
    sectionId: "hero",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T01:00:00Z",
  };

  const contentB: SiteContent = {
    id: "site-content-production:landing:hero",
    entityType: "site-content-production",
    content: "# Hero Section\n\nWelcome to our site!",
    pageId: "landing",
    sectionId: "hero",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:30:00Z",
  };

  describe("compareContent", () => {
    it("should identify identical content", () => {
      const result = compareContent("landing", "hero", contentA, contentB);

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.contentA).toBe(contentA);
      expect(result.contentB).toBe(contentB);
      expect(result.differences).toHaveLength(1); // Only updated timestamp differs
      expect(result.identical).toBe(false); // Because timestamps differ
    });

    it("should detect content differences", () => {
      const differentContent: SiteContent = {
        ...contentB,
        content: "# Hero Section\n\nDifferent content!",
      };

      const result = compareContent(
        "landing",
        "hero",
        contentA,
        differentContent,
      );

      expect(result.differences).toHaveLength(2); // content + updated timestamp
      expect(result.differences.some((d) => d.field === "content")).toBe(true);
      expect(result.identical).toBe(false);
    });

    it("should detect timestamp differences", () => {
      const result = compareContent("landing", "hero", contentA, contentB);

      const updatedDiff = result.differences.find((d) => d.field === "updated");
      expect(updatedDiff).toBeDefined();
      expect(updatedDiff?.valueA).toBe("2024-01-01T01:00:00Z");
      expect(updatedDiff?.valueB).toBe("2024-01-01T00:30:00Z");
    });

    it("should handle perfectly identical entities", () => {
      const identicalContent: SiteContent = {
        ...contentB,
        updated: contentA.updated, // Make timestamps match
      };

      const result = compareContent(
        "landing",
        "hero",
        contentA,
        identicalContent,
      );

      expect(result.differences).toHaveLength(0);
      expect(result.identical).toBe(true);
    });

    it("should not compare ID differences", () => {
      // IDs are intentionally different, should not be flagged as difference
      const result = compareContent("landing", "hero", contentA, contentB);

      expect(result.differences.some((d) => d.field === "id")).toBe(false);
    });

    it("should not compare entityType differences", () => {
      // Entity types are intentionally different, should not be flagged as difference
      const result = compareContent("landing", "hero", contentA, contentB);

      expect(result.differences.some((d) => d.field === "entityType")).toBe(
        false,
      );
    });

    it("should not compare page/section differences", () => {
      // Page and section should always match for comparison, so no need to flag differences
      const result = compareContent("landing", "hero", contentA, contentB);

      expect(result.differences.some((d) => d.field === "pageId")).toBe(false);
      expect(result.differences.some((d) => d.field === "sectionId")).toBe(
        false,
      );
    });
  });

  describe("isContentEquivalent", () => {
    it("should return true for equivalent content", () => {
      const result = isContentEquivalent(contentA, contentB);
      expect(result).toBe(true);
    });

    it("should return false for different content", () => {
      const differentContent: SiteContent = {
        ...contentB,
        content: "Different content",
      };

      const result = isContentEquivalent(contentA, differentContent);
      expect(result).toBe(false);
    });

    it("should return false for different page", () => {
      const differentPage: SiteContent = {
        ...contentB,
        pageId: "about",
      };

      const result = isContentEquivalent(contentA, differentPage);
      expect(result).toBe(false);
    });

    it("should return false for different section", () => {
      const differentSection: SiteContent = {
        ...contentB,
        sectionId: "features",
      };

      const result = isContentEquivalent(contentA, differentSection);
      expect(result).toBe(false);
    });

    it("should ignore timestamp differences", () => {
      const differentTimestamps: SiteContent = {
        ...contentB,
        created: "2024-01-02T00:00:00Z",
        updated: "2024-01-02T01:00:00Z",
      };

      const result = isContentEquivalent(contentA, differentTimestamps);
      expect(result).toBe(true);
    });

    it("should ignore ID differences", () => {
      const differentId: SiteContent = {
        ...contentB,
        id: "different-id",
      };

      const result = isContentEquivalent(contentA, differentId);
      expect(result).toBe(true);
    });
  });
});
