import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A package that renders the brain's own site needs the addresses that site
 * is reachable at and the templates other packages registered to fill it.
 * Both are the runtime's answers: where a brain's pages live is a runtime
 * decision, and a view template is contributed by whoever owns the type it
 * renders. Named consumer: @brains/site-builder.
 */
describe("service site reads", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-site-reads-test"),
    domain: "brain.example.com",
  });

  afterEach(async () => {
    await harness.reset();
  });

  interface Captured {
    readonly domain: string | undefined;
    readonly siteUrl: string | undefined;
    readonly previewUrl: string | undefined;
    readonly localSiteUrl: string | undefined;
    readonly preferLocalUrls: boolean;
    readonly viewNames: string[];
    readonly resolved: unknown;
  }

  it("hands setup the brain's addresses and the templates it renders with", async () => {
    let captured: Captured | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "site-builder",
        config: z.object({}),
        templates: {
          page: {
            schema: z.object({ title: z.string() }),
            format: ({ value }) => value.title,
          },
        },
        setup: async ({
          domain,
          siteUrl,
          previewUrl,
          localSiteUrl,
          preferLocalUrls,
          views,
          templates,
        }) => {
          captured = {
            domain,
            siteUrl,
            previewUrl,
            localSiteUrl,
            preferLocalUrls,
            viewNames: views.list().map((view) => view.name),
            resolved: await templates
              .resolve("site-builder:page")
              .catch(() => "unresolved"),
          };
          return {};
        },
      }),
      {},
      { name: "@fixture/site-builder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    await harness.installPlugin(plugin);

    if (!captured) throw new Error("setup did not run");
    // The harness brain is addressed by a domain, so the derived preview
    // address follows from it rather than being configured separately.
    expect(typeof captured.domain).toBe("string");
    expect(captured.previewUrl).toContain("https://");
    expect(captured.preferLocalUrls).toBe(false);
    expect(Array.isArray(captured.viewNames)).toBe(true);
    expect(captured.resolved).toBeDefined();
  });
});
