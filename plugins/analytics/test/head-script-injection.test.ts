import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { AnalyticsPlugin, type AnalyticsConfigInput } from "../src/index";

const cloudflare = {
  accountId: "abc123",
  apiToken: "cf_token",
  siteTag: "my-site-tag",
};

// Site builds run in the worker process, which registers plugins but never
// runs their ready phase. The beacon has to be there when a build asks.
describe("Analytics beacon in site builds", () => {
  const harness = createPluginHarness();

  afterEach(async () => {
    await harness.reset();
  });

  async function headScriptsInWorker(
    config: AnalyticsConfigInput,
  ): Promise<unknown[]> {
    const shell = harness.getMockShell();
    await new AnalyticsPlugin(config).register(shell, { executionOnly: true });
    const answers = await shell.getMessageBus().collect({
      type: SITE_BUILDER_CHANNELS.headScripts,
      payload: {},
      sender: "site-builder",
    });
    return answers.flatMap((answer) => ("data" in answer ? [answer.data] : []));
  }

  it("contributes the beacon with its own token, not the site tag", async () => {
    expect(
      await headScriptsInWorker({
        cloudflare: { ...cloudflare, beaconToken: "my-beacon-token" },
      }),
    ).toEqual([
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-beacon-token"}'></script>`,
    ]);
  });

  // A site Cloudflare proxies with automatic setup gets the beacon from the
  // edge; a second one from the brain would be redundant.
  it("contributes nothing with a site tag alone", async () => {
    expect(await headScriptsInWorker({ cloudflare })).toEqual([]);
  });

  it("contributes nothing when the beacon token is empty", async () => {
    expect(
      await headScriptsInWorker({
        cloudflare: { ...cloudflare, beaconToken: "" },
      }),
    ).toEqual([]);
  });

  it("contributes nothing when Cloudflare is not configured", async () => {
    expect(await headScriptsInWorker({})).toEqual([]);
  });
});
