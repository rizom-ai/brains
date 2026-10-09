import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { AnalyticsPlugin, type AnalyticsConfigInput } from "../src/index";

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

  it("contributes the Cloudflare beacon in the worker process", async () => {
    expect(
      await headScriptsInWorker({
        cloudflare: {
          accountId: "abc123",
          apiToken: "cf_token",
          siteTag: "my-site-tag",
        },
      }),
    ).toEqual([
      `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"my-site-tag"}'></script>`,
    ]);
  });

  it("contributes nothing when Cloudflare is not configured", async () => {
    expect(await headScriptsInWorker({})).toEqual([]);
  });

  it("contributes nothing when the site tag is empty", async () => {
    expect(
      await headScriptsInWorker({
        cloudflare: { accountId: "abc123", apiToken: "cf_token", siteTag: "" },
      }),
    ).toEqual([]);
  });
});
