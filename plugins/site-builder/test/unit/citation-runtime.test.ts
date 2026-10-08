import { describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  EntityUrlGenerator,
  entityDisplaySchema,
} from "@brains/site-composition";
import { SiteBuilder } from "../../src/lib/site-builder";
import { installSiteBuilder } from "../helpers/install";

// The host supplies one display map; the builder must not read a second config copy.
describe("installed site citation metadata", () => {
  for (const mode of ["selection", "fallback", "excluded"] as const) {
    it(`preserves ${mode} policy through host registration and builder setup`, async () => {
      const entityDisplay = {
        post: entityDisplaySchema.parse({ label: "Post", citable: false }),
        topic: entityDisplaySchema.parse({
          label: "Topic",
          ...(mode === "excluded" ? { citable: false } : {}),
        }),
        deck: entityDisplaySchema.parse({
          label: "Deck",
          ...(mode === "selection"
            ? { citable: true }
            : mode === "excluded"
              ? { citable: false }
              : {}),
        }),
      };
      const harness = createPluginHarness({ entityDisplay });
      const create = spyOn(SiteBuilder, "createFresh");
      try {
        await installSiteBuilder(harness, { autoRebuild: false });
        expect(create).toHaveBeenCalledTimes(1);
        const display = create.mock.calls[0]?.[5];
        expect(display).toEqual(entityDisplay);
        const urls = new EntityUrlGenerator(display);
        expect(
          ["post", "topic", "deck", "unknown"].filter((type) =>
            urls.isCitable(type),
          ),
        ).toEqual(
          mode === "selection"
            ? ["deck"]
            : mode === "fallback"
              ? ["topic", "deck"]
              : [],
        );
        expect(urls.hasRoute("post")).toBe(true);
        expect(urls.generateUrl("post", "example")).toBe("/posts/example");
      } finally {
        create.mockRestore();
        await harness.reset();
      }
    });
  }
});
