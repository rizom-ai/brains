import { describe, it, expect, afterEach, mock } from "bun:test";
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
    const fetch = mock(() =>
      Promise.reject(new Error("Unexpected metrics request")),
    );
    const plugin = analyticsPlugin(config, { fetch });
    const register = plugin.register.bind(plugin);
    plugin.register = (shell, options): ReturnType<typeof register> =>
      register(shell, { ...options, executionOnly: true });
    await harness.installPlugin(plugin);
    const answers = await harness.getMockShell().getMessageBus().collect({
      type: SITE_BUILDER_CHANNELS.headScripts,
      payload: {},
      sender: "@fixture/builder:site",
    });
    expect(fetch).not.toHaveBeenCalled();
    return answers;
  }

  it("answers in an execution-only worker without ready", async () => {
    expect(
      await scripts({
        cloudflare: {
          accountId: "abc",
          apiToken: "synthetic",
          siteTag: "my-site-tag",
          beaconToken: "my-beacon-token",
        },
      }),
    ).toEqual([
      {
        success: true,
        data: `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-beacon-token"}'></script>`,
      },
    ]);
  });

  it("contributes nothing without Cloudflare", async () => {
    expect(await scripts({})).toEqual([]);
  });

  for (const beaconToken of [undefined, ""]) {
    it(`contributes nothing with a site tag and ${beaconToken === undefined ? "no" : "an empty"} beacon token`, async () => {
      expect(
        await scripts({
          cloudflare: {
            accountId: "abc",
            apiToken: "synthetic",
            siteTag: "metrics-only",
            beaconToken,
          },
        }),
      ).toEqual([]);
    });
  }

  it("does not use the metrics filter to gate an explicit beacon", async () => {
    expect(
      await scripts({
        cloudflare: {
          accountId: "abc",
          apiToken: "synthetic",
          siteTag: "",
          beaconToken: "manual-token",
        },
      }),
    ).toEqual([
      {
        success: true,
        data: `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"manual-token"}'></script>`,
      },
    ]);
  });
});
