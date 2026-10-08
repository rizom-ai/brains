import { expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { sitePageUrl } from "../src/internal/site-page-url";
import { createPluginHarness } from "../src/test/harness";

it("resolves projection pages through the installed host's site routes, not guessed type paths", async () => {
  const entityDisplay = {
    post: { label: "Essay" },
    "network-piece": { label: "Piece", citable: false },
  };
  const harness = createPluginHarness({
    domain: "brain.example.com",
    entityDisplay,
  });
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
    expect(
      sitePageUrl("https://other.example", post, undefined),
    ).toBeUndefined();
    expect(
      sitePageUrl("https://other.example", post, {
        post: { label: "Article" },
      }),
    ).toBe("https://other.example/articles/saved-slug");
    expect(page(post)).toBe("https://brain.example.com/essays/saved-slug");
    expect(page({ ...post, metadata: {} })).toBe(
      "https://brain.example.com/essays/record",
    );
    // Citation exclusion does not remove a configured page.
    expect(page({ ...post, entityType: "network-piece" })).toBe(
      "https://brain.example.com/pieces/saved-slug",
    );
    expect(page({ ...post, entityType: "unrouted" })).toBeUndefined();
    expect(sitePageUrl(undefined, post, entityDisplay)).toBeUndefined();
  } finally {
    await harness.reset();
  }
});
