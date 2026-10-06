import { expect, it } from "bun:test";
import { EntityUrlGenerator } from "@brains/site-composition";
import { createTestEntity } from "@brains/entity-service/test";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { sitePageUrl } from "../src/internal/site-page-url";
import { createPluginHarness } from "../src/test/harness";

it("resolves projection pages through the installed host's live site routes, not guessed type paths", async () => {
  EntityUrlGenerator.resetInstance();
  const harness = createPluginHarness({ domain: "brain.example.com" });
  let page: ((entity: Readonly<BaseEntity>) => string | undefined) | undefined;
  const definition = defineServicePlugin({
    id: "publisher",
    config: z.object({}),
    setup: ({ sitePageUrl }) => {
      page = sitePageUrl;
      return {};
    },
  });
  try {
    await harness.installPlugins(
      instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/publisher", version: "0.0.0" },
      ),
    );
    if (!page) throw new Error("Missing host page resolver");
    const post = createTestEntity("post", {
      id: "record",
      metadata: { slug: "saved-slug" },
    });
    expect(page(post)).toBeUndefined();
    EntityUrlGenerator.getInstance().configure({
      post: { label: "Essay" },
      "network-piece": { label: "Piece", citable: false },
    });
    expect(page(post)).toBe("https://brain.example.com/essays/saved-slug");
    expect(page({ ...post, metadata: {} })).toBe(
      "https://brain.example.com/essays/record",
    );
    // Citation exclusion does not remove a configured page.
    expect(page({ ...post, entityType: "network-piece" })).toBe(
      "https://brain.example.com/pieces/saved-slug",
    );
    expect(page({ ...post, entityType: "unrouted" })).toBeUndefined();
    expect(sitePageUrl(undefined, post)).toBeUndefined();
  } finally {
    await harness.reset();
    EntityUrlGenerator.resetInstance();
  }
});
