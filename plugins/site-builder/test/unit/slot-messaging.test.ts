import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { defineServicePlugin, SdkError, z } from "@brains/sdk/services";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { caughtError } from "@brains/test-utils";
import { SiteBuilder } from "../../src/lib/site-builder";
import { instantiate, SITE_BUILDER_PLUGIN_ID } from "../helpers/install";

describe("worker layout contributions", () => {
  const h = createPluginHarness();
  const rendered: string[][] = [];
  let late: (() => unknown) | undefined;
  let restore = (): void => {};
  beforeEach(() => {
    const build = spyOn(SiteBuilder.prototype, "build").mockImplementation(
      async (options) => {
        const entries = options.slots?.getSlot("footer-top") ?? [];
        late = entries[0]?.render;
        rendered.push(
          entries.map(
            (entry) =>
              `${entry.pluginId}:${renderToStaticMarkup(entry.render())}`,
          ),
        );
        return {
          success: true,
          outputDir: options.outputDir,
          routesBuilt: 1,
          filesGenerated: 1,
        };
      },
    );
    restore = (): void => {
      build.mockRestore();
    };
  });
  afterEach(async () => {
    await h.reset();
    restore();
    rendered.length = 0;
    late = undefined;
  });
  async function worker(plugin: Plugin): Promise<void> {
    const register = plugin.register.bind(plugin);
    plugin.register = (shell, options): ReturnType<typeof register> =>
      register(shell, { ...options, executionOnly: true });
    await h.installPlugin(plugin);
  }
  async function contributor(
    id: string,
    priority: number,
    read: () => string[],
  ): Promise<void> {
    const declaration = defineServicePlugin(
      { id, config: z.object({}) },
      {
        layoutSlots: () =>
          read().map((value) => ({
            slotName: "footer-top",
            priority,
            render: (): ReturnType<typeof createElement> =>
              createElement("p", null, value),
          })),
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      declaration,
      {},
      { name: `@fixture/${id}`, version: "1" },
    );
    if (!plugin) throw new Error("Missing provider");
    await worker(plugin);
  }
  const build = (): Promise<unknown> =>
    h.runJob(`${SITE_BUILDER_PLUGIN_ID}:site-build`, {
      outputDir: "/tmp/slot-fixture",
      environment: "preview",
    });

  it("collects on every build, with priority/order, removal and no accumulated registrations", async () => {
    let values = ["first"];
    await contributor("low", 10, () => values);
    await worker(instantiate({}));
    await build();
    await contributor("high", 100, () => ["high"]);
    await contributor("tie", 100, () => ["tie"]);
    values = ["changed", "second"];
    await build();
    values = [];
    await build();
    expect(rendered).toEqual([
      ["@fixture/low:low:<p>first</p>"],
      [
        "@fixture/high:high:<p>high</p>",
        "@fixture/tie:tie:<p>tie</p>",
        "@fixture/low:low:<p>changed</p>",
        "@fixture/low:low:<p>second</p>",
      ],
      ["@fixture/high:high:<p>high</p>", "@fixture/tie:tie:<p>tie</p>"],
    ]);
    expect(late).toBeDefined();
    expect(() => late?.()).toThrow(SdkError);
  });

  it("refuses a failed collection without invoking the renderer", async () => {
    await worker(instantiate({}));
    await contributor("broken", 10, () => {
      throw new Error("private details");
    });
    expect(await build().catch(caughtError)).toMatchObject({
      code: "handler_failed",
    });
    expect(rendered).toEqual([]);
  });
});
