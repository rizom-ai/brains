import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { analyticsPlugin } from "./helpers/install";
import type { AnalyticsConfigInput } from "../src";

describe("Analytics worker head-script contributions", () => {
  const harness = createPluginHarness();
  afterEach(async () => {
    await harness.reset();
  });

  async function scripts(config: AnalyticsConfigInput): Promise<unknown[]> {
    const plugin = analyticsPlugin(config);
    const register = plugin.register.bind(plugin);
    plugin.register = (shell, options): ReturnType<typeof register> =>
      register(shell, { ...options, executionOnly: true });
    await harness.installPlugin(plugin);
    return harness.getMockShell().getMessageBus().collect({
      type: SITE_BUILDER_CHANNELS.headScripts,
      payload: {},
      sender: "@fixture/builder:site",
    });
  }

  it("answers in an execution-only worker without ready", async () => {
    expect(
      await scripts({
        cloudflare: {
          accountId: "abc",
          apiToken: "synthetic",
          siteTag: "my-site-tag",
        },
      }),
    ).toEqual([
      {
        success: true,
        data: `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-site-tag"}'></script>`,
      },
    ]);
  });

  it("contributes nothing without Cloudflare", async () => {
    expect(await scripts({})).toEqual([]);
  });

  it("contributes nothing without a site tag", async () => {
    expect(
      await scripts({
        cloudflare: { accountId: "abc", apiToken: "synthetic", siteTag: "" },
      }),
    ).toEqual([]);
  });
});
