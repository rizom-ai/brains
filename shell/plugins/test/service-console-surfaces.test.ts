import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ConsoleSurface,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A console renders a strip of links to the brain's other consoles. It used
 * to build that by reading the whole mounted route table and matching plugin
 * ids, which is one package knowing another's routes. The runtime knows what
 * is mounted and what each door requires; the console says who is asking and
 * where its own door is. Interfaces already ask this way; a console served by
 * a service asks the same. Named consumer: @brains/dashboard.
 */
describe("console surfaces a service can offer", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-surfaces-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<
    (options: {
      permissionLevel?: "public" | "trusted" | "admin";
      hasActiveSession?: boolean;
      selfHref?: string;
    }) => readonly ConsoleSurface[]
  > {
    let captured:
      | ((options: {
          permissionLevel?: "public" | "trusted" | "admin";
          hasActiveSession?: boolean;
          selfHref?: string;
        }) => readonly ConsoleSurface[])
      | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "dashboard",
        config: z.object({}),
        setup: ({ surfaces }) => {
          captured = surfaces;
          return {};
        },
      }),
      {},
      { name: "@fixture/dashboard", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  /** A door exists exactly when the plugin behind it mounted a route. */
  function mountRoute(pluginId: string, fullPath: string): void {
    harness.getMockShell().addPlugin({
      id: pluginId,
      version: "1.0.0",
      type: "interface",
      packageName: pluginId,
      register: async () => ({ tools: [], resources: [] }),
      getWebRoutes: () => [
        {
          path: fullPath,
          method: "GET",
          public: true,
          handler: (): Response => new Response("ok"),
        },
      ],
    });
  }

  it("lists its own door and the consoles a caller may reach", async () => {
    const surfaces = await install();
    mountRoute("@brains/studio:studio", "/studio");
    mountRoute("@brains/web-chat:web-chat", "/chat");

    const anonymous = surfaces({
      permissionLevel: "public",
      hasActiveSession: false,
      selfHref: "/dashboard",
    });
    expect(anonymous.map((surface) => surface.id)).toEqual(["dashboard"]);

    const operator = surfaces({
      permissionLevel: "admin",
      hasActiveSession: true,
      selfHref: "/dashboard",
    });
    expect(operator.map((surface) => surface.id)).toEqual([
      "dashboard",
      "web-chat",
      "studio",
    ]);
    expect(operator.find((surface) => surface.id === "studio")?.href).toBe(
      "/studio",
    );
    expect(
      operator.find((surface) => surface.id === "dashboard")?.isActive,
    ).toBe(true);
  });

  it("offers no door to a console nobody mounted", async () => {
    const surfaces = await install();

    expect(
      surfaces({
        permissionLevel: "admin",
        hasActiveSession: true,
        selfHref: "/dashboard",
      }).map((surface) => surface.id),
    ).toEqual(["dashboard"]);
  });
});
