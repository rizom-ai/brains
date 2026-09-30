import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  EntityUrlGenerator,
  entityDisplaySchema,
} from "@brains/site-composition";
import { installSiteBuilder } from "../helpers/install";

// The actual installation path parses config before SiteBuilder configures the
// shared selector used by guest answer sources. Testing the selector alone
// cannot catch a builder schema that strips the site's citation metadata.
describe("installed site citation metadata", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  beforeEach(() => {
    EntityUrlGenerator.resetInstance();
    harness = createPluginHarness();
  });
  afterEach(async () => {
    await harness.reset();
    EntityUrlGenerator.resetInstance();
  });

  for (const mode of ["selection", "fallback", "excluded"] as const) {
    it(`preserves ${mode} policy through config parsing and builder setup`, async () => {
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
      await installSiteBuilder(harness, { autoRebuild: false, entityDisplay });
      const urls = EntityUrlGenerator.getInstance();
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
      // Opt-out changes source selection, never page routing or permissions.
      expect(urls.hasRoute("post")).toBe(true);
      expect(urls.generateUrl("post", "example")).toBe("/posts/example");
      expect(entityDisplay.post.citable).toBe(false);
    });
  }
});
