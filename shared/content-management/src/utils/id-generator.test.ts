import { describe, it, expect } from "bun:test";
import {
  generateSiteContentId,
  parseSiteContentId,
  convertSiteContentId,
  previewToProductionId,
  productionToPreviewId,
} from "./id-generator";

describe("ID Generator", () => {
  describe("generateSiteContentId", () => {
    it("should generate correct preview ID", () => {
      const id = generateSiteContentId(
        "site-content-preview",
        "landing",
        "hero",
      );
      expect(id).toBe("site-content-preview:landing:hero");
    });

    it("should generate correct production ID", () => {
      const id = generateSiteContentId(
        "site-content-production",
        "about",
        "team",
      );
      expect(id).toBe("site-content-production:about:team");
    });

    it("should handle special characters in route and section", () => {
      const id = generateSiteContentId(
        "site-content-preview",
        "user-profile",
        "contact-info",
      );
      expect(id).toBe("site-content-preview:user-profile:contact-info");
    });
  });

  describe("parseSiteContentId", () => {
    it("should parse valid preview ID", () => {
      const result = parseSiteContentId("site-content-preview:landing:hero");
      expect(result).toEqual({
        entityType: "site-content-preview",
        routeId: "landing",
        sectionId: "hero",
      });
    });

    it("should parse valid production ID", () => {
      const result = parseSiteContentId("site-content-production:about:team");
      expect(result).toEqual({
        entityType: "site-content-production",
        routeId: "about",
        sectionId: "team",
      });
    });

    it("should return null for invalid format", () => {
      expect(parseSiteContentId("invalid-format")).toBeNull();
      expect(parseSiteContentId("site-content-preview:landing")).toBeNull();
      expect(
        parseSiteContentId("site-content-preview:landing:hero:extra"),
      ).toBeNull();
      expect(parseSiteContentId("")).toBeNull();
    });

    it("should return null for invalid entity type", () => {
      expect(parseSiteContentId("invalid-type:landing:hero")).toBeNull();
      expect(parseSiteContentId("site-content:landing:hero")).toBeNull();
    });

    it("should handle special characters in route and section", () => {
      const result = parseSiteContentId(
        "site-content-preview:user-profile:contact-info",
      );
      expect(result).toEqual({
        entityType: "site-content-preview",
        routeId: "user-profile",
        sectionId: "contact-info",
      });
    });
  });

  describe("convertSiteContentId", () => {
    it("should convert preview ID to production ID", () => {
      const productionId = convertSiteContentId(
        "site-content-preview:landing:hero",
        "site-content-production",
      );
      expect(productionId).toBe("site-content-production:landing:hero");
    });

    it("should convert production ID to preview ID", () => {
      const previewId = convertSiteContentId(
        "site-content-production:landing:hero",
        "site-content-preview",
      );
      expect(previewId).toBe("site-content-preview:landing:hero");
    });

    it("should return null for invalid ID", () => {
      expect(
        convertSiteContentId("invalid-format", "site-content-preview"),
      ).toBeNull();
      expect(convertSiteContentId("", "site-content-production")).toBeNull();
    });
  });

  describe("previewToProductionId", () => {
    it("should convert preview ID to production ID", () => {
      const productionId = previewToProductionId(
        "site-content-preview:landing:hero",
      );
      expect(productionId).toBe("site-content-production:landing:hero");
    });

    it("should return null for production ID input", () => {
      const result = previewToProductionId(
        "site-content-production:landing:hero",
      );
      expect(result).toBeNull();
    });

    it("should return null for invalid ID", () => {
      expect(previewToProductionId("invalid-format")).toBeNull();
      expect(previewToProductionId("")).toBeNull();
    });
  });

  describe("productionToPreviewId", () => {
    it("should convert production ID to preview ID", () => {
      const previewId = productionToPreviewId(
        "site-content-production:landing:hero",
      );
      expect(previewId).toBe("site-content-preview:landing:hero");
    });

    it("should return null for preview ID input", () => {
      const result = productionToPreviewId("site-content-preview:landing:hero");
      expect(result).toBeNull();
    });

    it("should return null for invalid ID", () => {
      expect(productionToPreviewId("invalid-format")).toBeNull();
      expect(productionToPreviewId("")).toBeNull();
    });
  });
});
