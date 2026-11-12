import { describe, expect, it } from "bun:test";
import { defineBusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  createServicePluginContext,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class asks the bus as its class did
 * through context.messaging, from wherever it builds what it serves, setup
 * included: a request's one owner, a command every hearer takes, and every
 * owner of a collect contract, each sent as the package.
 */

const siteMetadata = defineBusContract({
  channel: "probe-site:metadata",
  request: z.object({}),
  response: z.object({ title: z.string() }),
  delivery: "request",
});
const stage = defineBusContract({
  channel: "probe-site:stage",
  request: z.object({ path: z.string() }),
  response: z.void(),
  delivery: "command",
});
const headScripts = defineBusContract({
  channel: "probe-site:head-scripts",
  request: z.object({}),
  response: z.string(),
  delivery: "collect",
});

async function runtimeFromSetup(shell: MockShell): Promise<ServiceRuntime> {
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
  await plugin?.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

describe("a first-party service asking the bus as its class did", () => {
  it("requests, commands and gathers, as the package", async () => {
    const shell = createMockShell();
    const heard: Array<{ channel: string; sender: string; payload: unknown }> =
      [];
    const owner = createServicePluginContext(shell, "site-info");
    owner.messaging.answer(siteMetadata, async (_request, { sender }) => {
      heard.push({ channel: siteMetadata.name, sender, payload: {} });
      return { title: "Brain" };
    });
    owner.messaging.answer(stage, async (request, { sender }) => {
      heard.push({ channel: stage.name, sender, payload: request });
    });
    for (const [pluginId, script] of [
      ["analytics", "<script>beacon</script>"],
      ["newsletter", "<script>signup</script>"],
    ] as const) {
      createServicePluginContext(shell, pluginId).messaging.answer(
        headScripts,
        async () => script,
      );
    }
    const runtime = await runtimeFromSetup(shell);

    expect(await runtime.messaging.request(siteMetadata, {})).toEqual({
      status: "answered",
      data: { title: "Brain" },
    });
    await runtime.messaging.command(stage, { path: "/feed.xml" });
    expect(await runtime.messaging.gather(headScripts, {})).toMatchObject({
      status: "answered",
      answers: ["<script>beacon</script>", "<script>signup</script>"],
    });
    expect(heard).toEqual([
      { channel: "probe-site:metadata", sender: "probe", payload: {} },
      {
        channel: "probe-site:stage",
        sender: "probe",
        payload: { path: "/feed.xml" },
      },
    ]);
  });

  it("is unavailable when nobody answers", async () => {
    const runtime = await runtimeFromSetup(createMockShell());
    expect(await runtime.messaging.request(siteMetadata, {})).toEqual({
      status: "unavailable",
    });
    expect(await runtime.messaging.gather(headScripts, {})).toEqual({
      status: "unavailable",
    });
  });
});
