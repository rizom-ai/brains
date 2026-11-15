import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withApiRoutes,
  type PluginPackageDefinition,
  type ServicePackageDefinition,
} from "../src";

/**
 * A first-party service converted from a class declares the API routes its
 * class served, as written, from its parsed config: each backed by one of
 * its tools by name, mounted under /api/<plugin id>, with the redirects a
 * form post follows. Newsletter's signup form posts to one.
 */

const config = z.object({ apiKey: z.string().optional() });

function plugin(
  definition: PluginPackageDefinition,
  input: unknown = {},
): ReturnType<typeof instantiatePluginPackageDefinition>[number] {
  const [created] = instantiatePluginPackageDefinition(
    definition,
    input,
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!created) throw new Error("No plugin was created");
  return created;
}

describe("withApiRoutes", () => {
  const provider = withApiRoutes(
    defineServicePlugin({ id: "probe", config }),
    ({ config: parsed }) =>
      parsed.apiKey
        ? [
            {
              path: "/subscribe",
              method: "POST",
              tool: "newsletter_signup",
              public: true,
              successRedirect: "/subscribe/thanks",
              errorRedirect: "/subscribe/error",
            },
          ]
        : [],
  );

  it("serves the routes its class served, from its parsed config", () => {
    expect(plugin(provider, { apiKey: "key" }).getApiRoutes?.()).toEqual([
      {
        path: "/subscribe",
        method: "POST",
        tool: "newsletter_signup",
        public: true,
        successRedirect: "/subscribe/thanks",
        errorRedirect: "/subscribe/error",
      },
    ]);
    expect(plugin(provider).getApiRoutes?.()).toEqual([]);
  });

  it("serves none without them", () => {
    expect(
      plugin(defineServicePlugin({ id: "probe", config })).getApiRoutes?.(),
    ).toEqual([]);
  });

  it("is declared once, on a definition defineServicePlugin returned", () => {
    expect(() => withApiRoutes(provider, () => [])).toThrow(
      'Service "probe" declares its API routes more than once',
    );
    const forged: ServicePackageDefinition<typeof config> = {
      ...defineServicePlugin({ id: "probe", config }),
    };
    expect(() => withApiRoutes(forged, () => [])).toThrow(
      'withApiRoutes takes a definition defineServicePlugin returned; "probe" is not one',
    );
  });
});
