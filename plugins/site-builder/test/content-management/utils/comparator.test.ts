import { describe, it, expect } from "bun:test";
import type {
  SiteContentPreview,
  SiteContentProduction,
} from "../../../src/types";
import {
  compareContent,
  isContentEquivalent,
} from "../../../src/content-management/utils/comparator";

describe("Content Comparator", () => {
  const previewEntity: SiteContentPreview = {
    id: "site-content-preview:landing:hero",
    entityType: "site-content-preview",
    content: "# Hero Section\n\nWelcome to our site!",
    pageId: "landing",
    sectionId: "hero",
    created: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T01:00:00Z",
  };

  const productionEntity: SiteContentProduction = {
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
      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        productionEntity,
      );

      expect(result.pageId).toBe("landing");
      expect(result.sectionId).toBe("hero");
      expect(result.preview).toBe(previewEntity);
      expect(result.production).toBe(productionEntity);
      expect(result.differences).toHaveLength(1); // Only updated timestamp differs
      expect(result.identical).toBe(false); // Because timestamps differ
    });

    it("should detect content differences", () => {
      const differentProduction: SiteContentProduction = {
        ...productionEntity,
        content: "# Hero Section\n\nDifferent content!",
      };

      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        differentProduction,
      );

      expect(result.differences).toHaveLength(2); // content + updated timestamp
      expect(result.differences.some((d) => d.field === "content")).toBe(true);
      expect(result.identical).toBe(false);
    });

    it("should detect timestamp differences", () => {
      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        productionEntity,
      );

      const updatedDiff = result.differences.find((d) => d.field === "updated");
      expect(updatedDiff).toBeDefined();
      expect(updatedDiff?.previewValue).toBe("2024-01-01T01:00:00Z");
      expect(updatedDiff?.productionValue).toBe("2024-01-01T00:30:00Z");
    });

    it("should handle perfectly identical entities", () => {
      const identicalProduction: SiteContentProduction = {
        ...productionEntity,
        updated: previewEntity.updated, // Make timestamps match
      };

      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        identicalProduction,
      );

      expect(result.differences).toHaveLength(0);
      expect(result.identical).toBe(true);
    });

    it("should not compare ID differences", () => {
      // IDs are intentionally different, should not be flagged as difference
      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        productionEntity,
      );

      expect(result.differences.some((d) => d.field === "id")).toBe(false);
    });

    it("should not compare entityType differences", () => {
      // Entity types are intentionally different, should not be flagged as difference
      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        productionEntity,
      );

      expect(result.differences.some((d) => d.field === "entityType")).toBe(
        false,
      );
    });

    it("should not compare page/section differences", () => {
      // Page and section should always match for comparison, so no need to flag differences
      const result = compareContent(
        "landing",
        "hero",
        previewEntity,
        productionEntity,
      );

      expect(result.differences.some((d) => d.field === "pageId")).toBe(false);
      expect(result.differences.some((d) => d.field === "sectionId")).toBe(
        false,
      );
    });
  });

  describe("isContentEquivalent", () => {
    it("should return true for equivalent content", () => {
      const result = isContentEquivalent(previewEntity, productionEntity);
      expect(result).toBe(true);
    });

    it("should return false for different content", () => {
      const differentProduction: SiteContentProduction = {
        ...productionEntity,
        content: "Different content",
      };

      const result = isContentEquivalent(previewEntity, differentProduction);
      expect(result).toBe(false);
    });

    it("should return false for different page", () => {
      const differentProduction: SiteContentProduction = {
        ...productionEntity,
        pageId: "about",
      };

      const result = isContentEquivalent(previewEntity, differentProduction);
      expect(result).toBe(false);
    });

    it("should return false for different section", () => {
      const differentProduction: SiteContentProduction = {
        ...productionEntity,
        sectionId: "features",
      };

      const result = isContentEquivalent(previewEntity, differentProduction);
      expect(result).toBe(false);
    });

    it("should ignore timestamp differences", () => {
      const differentTimestamps: SiteContentProduction = {
        ...productionEntity,
        created: "2024-01-02T00:00:00Z",
        updated: "2024-01-02T01:00:00Z",
      };

      const result = isContentEquivalent(previewEntity, differentTimestamps);
      expect(result).toBe(true);
    });

    it("should ignore ID differences", () => {
      const differentId: SiteContentProduction = {
        ...productionEntity,
        id: "different-id",
      };

      const result = isContentEquivalent(previewEntity, differentId);
      expect(result).toBe(true);
    });
  });
});
