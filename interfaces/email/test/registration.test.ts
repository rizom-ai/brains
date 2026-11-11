import { afterEach, describe, expect, it } from "bun:test";
import { emailSourceReadContract } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockShell } from "@brains/plugins/test";
import { createEmailPlugin } from "./email-plugin";

const transport = {
  transport: "resend",
  apiKey: "resend-key",
  from: "Rover <setup@example.com>",
} as const;
const imap = {
  host: "imap.example.com",
  port: 993,
  user: "inbox-user",
  password: "inbox-password",
};
const emailChannel = {
  type: "email",
  displayName: "Email",
  subjectLabel: "Email address",
  subjectPattern: { source: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", flags: "i" },
  manualDelivery: true,
};

/**
 * What the Email interface registers, pinned as its class registered it:
 * the email channel recipients are validated against, its sender, the IMAP
 * listener daemon and the source-read answer.
 */
describe("the Email interface's registered surface", () => {
  const harness = createPluginHarness();

  afterEach(async () => {
    await harness.reset();
  });

  it("registers one interface plugin, email, with no tools, resources or routes", async () => {
    const plugin = createEmailPlugin({ ...transport, imap });
    const capabilities = await harness.installPlugin(plugin);

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "email",
      "interface",
      "@brains/email",
    ]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(
      "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
        ? plugin.getWebRoutes()
        : [],
    ).toEqual([]);
    expect(
      "requiresDaemonStartup" in plugin &&
        typeof plugin.requiresDaemonStartup === "function"
        ? plugin.requiresDaemonStartup()
        : false,
    ).toBe(false);
  });

  it("with a transport and a mailbox: the channel, its sender, the listener and the source-read answer", async () => {
    await harness.installPlugin(createEmailPlugin({ ...transport, imap }));
    const shell = harness.getMockShell();
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([
      emailChannel,
    ]);
    expect(
      await shell
        .getChannelRegistry()
        .getDeliveryProvider("email")
        ?.isAvailable(),
    ).toBe(true);
    expect(shell.getDaemonRegistry().getAll()).toEqual(["email:email"]);
    expect(shell.getDaemonRegistry().get("email:email")?.pluginId).toBe(
      "email",
    );
    expect(await shell.getDaemonRegistry().checkHealth("email:email")).toEqual({
      status: "error",
      message: "Inbound email listener disconnected",
      lastCheck: expect.any(Date),
    });
    expect(
      await harness
        .getServiceContext("registration-test")
        .messaging.request(emailSourceReadContract, {
          sourceRef: `imap:${"0".repeat(64)}`,
          actor: { permissionLevel: "public" },
        }),
    ).toEqual({ status: "answered", data: { kind: "unavailable" } });
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("without credentials: the channel alone, no sender, listener or answer", async () => {
    await harness.installPlugin(createEmailPlugin());
    const shell = harness.getMockShell();
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([
      emailChannel,
    ]);
    expect(
      shell.getChannelRegistry().getDeliveryProvider("email"),
    ).toBeUndefined();
    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
    expect(
      await harness
        .getServiceContext("registration-test")
        .messaging.request(emailSourceReadContract, {
          sourceRef: `imap:${"0".repeat(64)}`,
          actor: { permissionLevel: "admin" },
        }),
    ).toEqual({ status: "unavailable" });
  });

  it("registers the channel and its sender in the worker, and nothing else", async () => {
    const plugin = createEmailPlugin({ ...transport, imap });
    const worker = createMockShell();
    await plugin.registerChannelsForExecution?.(worker);
    worker.getChannelRegistry().finalize();

    expect(worker.getChannelRegistry().listDescriptors()).toEqual([
      emailChannel,
    ]);
    expect(
      await worker
        .getChannelRegistry()
        .getDeliveryProvider("email")
        ?.isAvailable(),
    ).toBe(true);
    expect(worker.getDaemonRegistry().getAll()).toEqual([]);
  });
});
