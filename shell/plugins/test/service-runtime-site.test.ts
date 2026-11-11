import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShellOptions } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type PluginRegistrationContext,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party site builder converted from a class reads where the site
 * is as its class did: its preview URL beside the site URL, the local URL
 * a brain without a public domain links to and whether links prefer it,
 * and the site's entity display, which names each type's page.
 */

async function runtimeOn(
  options: MockShellOptions,
  registration: PluginRegistrationContext = {},
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  await plugin?.register(createMockShell(options), registration);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

describe("where a first-party site builder's site is", () => {
  it("reads the preview, local and public URLs as its class did", async () => {
    const runtime = await runtimeOn({
      domain: "brain.test",
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
    });
    expect({
      siteUrl: runtime.siteUrl,
      previewUrl: runtime.previewUrl,
      localSiteUrl: runtime.localSiteUrl,
      preferLocalUrls: runtime.preferLocalUrls,
    }).toEqual({
      siteUrl: "https://brain.test",
      previewUrl: "https://preview.brain.test",
      localSiteUrl: "http://localhost:8080",
      preferLocalUrls: true,
    });
  });

  it("has no preview URL without a domain, and prefers no local links unless told", async () => {
    const runtime = await runtimeOn({});
    expect({
      siteUrl: runtime.siteUrl,
      previewUrl: runtime.previewUrl,
      preferLocalUrls: runtime.preferLocalUrls,
    }).toEqual({
      siteUrl: undefined,
      previewUrl: undefined,
      preferLocalUrls: false,
    });
  });

  it("reads the site's entity display, as registration hands it", async () => {
    const entityDisplay = {
      post: { label: "Essay", pluralName: "essays" },
    };
    expect((await runtimeOn({}, { entityDisplay })).entityDisplay).toEqual(
      entityDisplay,
    );
    expect((await runtimeOn({})).entityDisplay).toBeUndefined();
  });
});
