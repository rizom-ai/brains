import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { defineServicePlugin, z } from "@brains/sdk/services";
import { analyticsPlugin } from "./helpers/install";

describe("Analytics build-time ordering", () => {
  for (const analyticsFirst of [true, false]) {
    it(`works without ready when analytics registers ${analyticsFirst ? "first" : "last"}`, async () => {
      const harness = createPluginHarness();
      let read: () => Promise<readonly string[]> = async () => {
        throw new Error("Not installed");
      };
      const definition = defineServicePlugin({
        id: "reader",
        config: z.object({}),
        setup: ({ siteContributions }) => {
          read = siteContributions.headScripts;
          return {};
        },
      });
      const [reader] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/site", version: "1" },
      );
      if (!reader) throw new Error("Missing reader");
      const analytics = analyticsPlugin({
        cloudflare: {
          accountId: "abc",
          apiToken: "synthetic",
          siteTag: "metrics-tag",
          beaconToken: "ordered-token",
        },
      });
      async function install(plugin: Plugin): Promise<void> {
        const register = plugin.register.bind(plugin);
        plugin.register = (shell, options): ReturnType<typeof register> =>
          register(shell, { ...options, executionOnly: true });
        await harness.installPlugin(plugin);
      }
      try {
        for (const plugin of analyticsFirst
          ? [analytics, reader]
          : [reader, analytics])
          await install(plugin);
        const first = await read();
        expect(first).toHaveLength(1);
        expect(first[0]).toContain("ordered-token");
        expect(first[0]).not.toContain("metrics-tag");
        expect(first[0]).not.toContain("synthetic");
        expect(await read()).toEqual(first);
      } finally {
        await harness.reset();
      }
    });
  }
});
