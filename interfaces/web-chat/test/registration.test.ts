import { afterEach, describe, expect, it } from "bun:test";
import { createMockShell, createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { createWebChatPlugin } from "./web-chat-plugin";

const defaultRoutes = [
  "GET /ask public=true preview=true role=ask",
  "POST /api/chat public=true preview=false role=chat-api",
  "POST /api/chat/actions public=true preview=false role=",
  "GET /api/chat/sessions public=true preview=false role=",
  "DELETE /api/chat/sessions public=true preview=false role=",
  "PUT /api/chat/sessions public=true preview=false role=",
  "PUT /api/chat/sessions/archive public=true preview=false role=",
  "GET /api/chat/messages public=true preview=false role=",
  "POST /api/chat/context-sessions public=true preview=false role=",
  "GET /api/chat/attachments/document public=true preview=false role=",
  "GET /api/chat/attachments/image public=true preview=false role=",
  "GET /api/chat/jobs/status public=true preview=false role=",
  "POST /api/chat/uploads public=true preview=false role=",
  "GET /api/chat/uploads public=true preview=false role=",
  "POST /api/agent/chat public=true preview=false role=",
  "POST /api/agent/chat/confirm public=true preview=false role=",
  "GET /ask/authenticated public=true preview=false role=",
  "GET /ask/assets/dashboard.js public=true preview=true role=",
  "GET /ask/assets/dashboard.css public=true preview=true role=",
  "GET /ask/assets/box.js public=true preview=true role=",
  "GET /ask/assets/version public=true preview=true role=",
  "GET /ask/assets/boot.js public=true preview=true role=",
  "GET /ask/assets/ask.js public=true preview=true role=",
  "GET /ask/assets/ask.css public=true preview=true role=",
  "GET /ask/assets/guest.js public=true preview=true role=",
  "GET /ask/assets/page.css public=true preview=true role=",
  "GET /ask/assets/guest.css public=true preview=true role=",
  "POST /api/chat/guest/session public=true preview=true role=",
  "POST /api/chat/guest public=true preview=true role=",
  "GET /api/chat/guest/messages public=true preview=true role=",
  "DELETE /api/chat/guest/sessions public=true preview=true role=",
  "GET /api/chat/guest/access public=true preview=false role=",
  "POST /api/chat/guest/access public=true preview=false role=",
];

/**
 * What web chat registers, pinned as its class registered it: the Ask page
 * and chat API on the shared host, the guest-maintenance daemon, and no
 * tool, channel, endpoint or interaction.
 */
describe("the web chat interface's registered surface", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger(),
    domain: "brain.test",
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("registers plugin web-chat with its routes and guest-maintenance daemon", async () => {
    const plugin = createWebChatPlugin();
    const capabilities = await harness.installPlugin(plugin);
    const shell = harness.getMockShell();
    shell.getChannelRegistry().finalize();
    const registry = shell.getDaemonRegistry();

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "web-chat",
      "interface",
      "@brains/web-chat",
    ]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(
      plugin
        .getWebRoutes()
        .map(
          (route) =>
            `${route.method ?? "GET"} ${route.path} public=${String(route.public ?? false)} preview=${String(route.preview ?? false)} role=${route.role ?? ""}`,
        ),
    ).toEqual(defaultRoutes);
    expect(registry.getAll()).toEqual(["web-chat:guest-maintenance"]);
    expect(registry.get("web-chat:guest-maintenance")?.pluginId).toBe(
      "web-chat",
    );
    expect(await registry.checkHealth("web-chat:guest-maintenance")).toEqual({
      status: "unknown",
    });
    expect(shell.getChannelRegistry().listDescriptors()).toEqual([]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
    expect(
      "requiresDaemonStartup" in plugin &&
        typeof plugin.requiresDaemonStartup === "function"
        ? plugin.requiresDaemonStartup()
        : false,
    ).toBe(false);
  });

  it("without a site, serves the chat API and guest API but no guest page or assets", async () => {
    const local = createPluginHarness({ logger: createSilentLogger() });
    const plugin = createWebChatPlugin();
    await local.installPlugin(plugin);

    expect(
      plugin
        .getWebRoutes()
        .map(
          (route) =>
            `${route.method ?? "GET"} ${route.path} public=${String(route.public ?? false)} preview=${String(route.preview ?? false)} role=${route.role ?? ""}`,
        ),
    ).toEqual([...defaultRoutes.slice(0, 16), ...defaultRoutes.slice(27)]);
    await local.reset();
  });

  it("registers no channel in the worker", async () => {
    const plugin = createWebChatPlugin();
    const worker = createMockShell();
    await plugin.registerChannelsForExecution?.(worker);
    worker.getChannelRegistry().finalize();

    expect(worker.getChannelRegistry().listDescriptors()).toEqual([]);
    expect(worker.getDaemonRegistry().getAll()).toEqual([]);
  });
});
