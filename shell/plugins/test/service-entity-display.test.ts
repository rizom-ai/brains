import { expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

it("detaches service display metadata from host routes and other services", async () => {
  const display = {
    post: {
      label: "Essay",
      pluralName: "essays",
      citable: false,
      navigation: { show: true },
    },
  };
  const h = createPluginHarness({
    domain: "example.com",
    entityDisplay: display,
  });
  const urls: Array<string | undefined> = [];
  const labels: string[] = [];
  const entity = {
    id: "one",
    entityType: "post",
    content: "Body",
    contentHash: "hash",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    visibility: "public" as const,
    metadata: { slug: "intro" },
  };
  try {
    for (const mutates of [true, false]) {
      const definition = defineServicePlugin({
        id: "reader",
        config: z.object({}),
        setup: ({ entityDisplay, sitePageUrl }) => {
          const post = entityDisplay?.["post"];
          if (!post?.navigation)
            throw new Error("Missing fixture display metadata");
          if (mutates) {
            post.label = "Changed";
            post.pluralName = "elsewhere";
            post.citable = true;
            post.navigation.show = false;
          }
          labels.push(post.label);
          urls.push(sitePageUrl(entity));
          return {};
        },
      });
      await h.installPlugins(
        instantiatePluginPackageDefinition(
          definition,
          {},
          {
            name: mutates ? "@fixture/first" : "@fixture/second",
            version: "0.0.0",
          },
        ),
      );
    }
    expect(labels).toEqual(["Changed", "Essay"]);
    expect(urls).toEqual([
      "https://example.com/essays/intro",
      "https://example.com/essays/intro",
    ]);
    expect(display.post).toEqual({
      label: "Essay",
      pluralName: "essays",
      citable: false,
      navigation: { show: true },
    });
  } finally {
    await h.reset();
  }
});
