import { afterEach, describe, expect, it } from "bun:test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { newsletterService } from "../src";
import type { ButtondownFetch } from "../src/lib/buttondown-client";
import { jsonResponse, PACKAGE_METADATA } from "./helpers/install";

const SUBSCRIBE_PATH = "/api/newsletter/subscribe";

/**
 * Two brains built from one exported definition.
 *
 * A package is exported once and installed wherever it is configured, so the
 * same definition can be instantiated more than once in a process. Every other
 * test here builds a fresh definition per install, which is exactly the path
 * that never exercises reuse — so this one builds the definition once and
 * installs it twice, the way a second brain in the same process would.
 */
describe("two instances of one newsletter definition", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("newsletter-two-instances"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("answers with the key its own instance was configured with", async () => {
    const seen: string[] = [];
    const recordingFetch: ButtondownFetch = (_url, init) => {
      const headers = init.headers;
      const authorization =
        headers instanceof Headers
          ? headers.get("Authorization")
          : Array.isArray(headers)
            ? null
            : (headers?.["Authorization"] ?? null);
      seen.push(authorization ?? "none");
      return jsonResponse({ id: "sub-1" }, 201);
    };

    // One definition, exported once, installed twice.
    const definition = newsletterService({ fetch: recordingFetch });
    bindPluginPackageMetadata(definition, PACKAGE_METADATA);

    const install = async (apiKey: string): Promise<Plugin> => {
      const plugins = instantiatePluginPackageDefinition(
        definition,
        { apiKey },
        PACKAGE_METADATA,
      );
      const entity = plugins.find(({ type }) => type === "entity");
      const service = plugins.find(({ type }) => type === "service");
      if (!entity || !service) {
        throw new Error("Newsletter package did not produce both plugins");
      }
      await harness.installPlugin(entity);
      await harness.installPlugin(service);
      return service;
    };

    const first = await install("key-A");
    const second = await install("key-B");

    const post = async (service: Plugin): Promise<void> => {
      const route: WebRouteDefinition | undefined = service
        .getWebRoutes?.()
        .find(
          ({ path, method }) => path === SUBSCRIBE_PATH && method === "POST",
        );
      if (!route) throw new Error("Subscribe route was not declared");
      await route.handler(
        new Request(`https://brain.test${SUBSCRIBE_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "reader@example.com" }),
        }),
      );
    };

    // The first instance is asked after the second one has set up.
    await post(first);
    await post(second);

    expect(seen).toEqual([
      expect.stringContaining("key-A"),
      expect.stringContaining("key-B"),
    ]);
  });
});
