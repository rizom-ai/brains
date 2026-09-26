import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { defineInterface, instantiatePluginPackageDefinition } from "../src";

/**
 * The URL this brain's own links are addressed by, right now.
 *
 * Three packages computed it from the same three context fields —
 * `preferLocalUrls ? localSiteUrl : (siteUrl ?? localSiteUrl)` — which is a
 * rule about which URL wins, not a fact any of them owns. An interface
 * resolving an artifact card back to its entity has to agree with the site
 * builder that wrote the link, and the way to guarantee that is for both to
 * be told rather than each deciding.
 */

function urlReader(
  seen: Array<string | undefined>,
): ReturnType<typeof defineInterface> {
  return defineInterface({
    id: "url-reader",
    config: z.object({}),
    setup: ({ displayBaseUrl }) => {
      seen.push(displayBaseUrl);
      return {};
    },
  });
}

async function install(
  seen: Array<string | undefined>,
  options: Parameters<typeof createPluginHarness>[0],
): Promise<void> {
  const [plugin] = instantiatePluginPackageDefinition(
    urlReader(seen),
    {},
    { name: "@fixture/url-reader", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Interface plugin was not created");
  const harness = createPluginHarness(options);
  await harness.installPlugin(plugin);
  await harness.finalizeRegistration();
}

describe("the URL an interface addresses this brain by", () => {
  it("is the site URL when the brain has a domain", async () => {
    const seen: Array<string | undefined> = [];
    await install(seen, { domain: "brain.example" });

    expect(seen).toEqual(["https://brain.example"]);
  });

  it("prefers the local URL when the runtime says to", async () => {
    const seen: Array<string | undefined> = [];
    await install(seen, {
      domain: "brain.example",
      localSiteUrl: "http://localhost:4321",
      preferLocalUrls: true,
    });

    expect(seen).toEqual(["http://localhost:4321"]);
  });

  it("falls back to the local URL when there is no domain", async () => {
    const seen: Array<string | undefined> = [];
    await install(seen, { localSiteUrl: "http://localhost:4321" });

    expect(seen).toEqual(["http://localhost:4321"]);
  });
});
