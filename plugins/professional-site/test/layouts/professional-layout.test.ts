import { describe, it, expect } from "bun:test";
import { UISlotRegistry } from "@brains/site-builder-plugin";
import type { ProfessionalLayoutProps } from "../../src/layouts/ProfessionalLayout";

/**
 * Note: Full rendering tests are skipped due to a bun JSX transpilation issue
 * where TSX files from workspace packages produce React-style VNodes instead
 * of Preact VNodes. The slot functionality is fully tested in site-builder.
 *
 * These tests verify the type interface and slot registry behavior.
 */
describe("ProfessionalLayout", () => {
  describe("slots prop interface", () => {
    it("should accept slots prop in type definition", () => {
      // Verify the props interface accepts slots
      const props: ProfessionalLayoutProps = {
        sections: [],
        title: "Test",
        description: "Test",
        path: "/",
        siteInfo: {
          title: "Test Site",
          description: "Test Description",
          copyright: "© 2025 Test",
          navigation: {
            primary: [],
            secondary: [],
          },
        },
        slots: new UISlotRegistry(),
      };

      expect(props.slots).toBeDefined();
    });

    it("should allow slots to be optional", () => {
      // Verify slots is optional
      const props: ProfessionalLayoutProps = {
        sections: [],
        title: "Test",
        description: "Test",
        path: "/",
        siteInfo: {
          title: "Test Site",
          description: "Test Description",
          copyright: "© 2025 Test",
          navigation: {
            primary: [],
            secondary: [],
          },
        },
        // No slots prop - should compile
      };

      expect(props.slots).toBeUndefined();
    });

    it("should allow registering render functions to footer-top slot", () => {
      const slotRegistry = new UISlotRegistry();

      slotRegistry.register("footer-top", {
        pluginId: "newsletter",
        render: () => null,
      });

      expect(slotRegistry.hasSlot("footer-top")).toBe(true);
      expect(slotRegistry.getSlot("footer-top")).toHaveLength(1);
    });
  });
});
