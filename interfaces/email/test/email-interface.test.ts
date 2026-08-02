import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";

import {
  EmailInterface,
  type EmailImapConfig,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
  shouldRedactDelivery,
} from "../src";
import { emailEnvSchema } from "../src/env-schema";

async function waitForAbort(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

const imapConfig: EmailImapConfig = {
  host: "imap.example.com",
  port: 993,
  user: "inbox-user",
  password: "inbox-password",
  mailbox: "Private Inbox",
  pollMode: "idle",
  pollIntervalMs: 60_000,
};

describe("EmailInterface", () => {
  it("owns Email metadata and registers a provider only with a configured transport", async () => {
    const configuredHarness = createPluginHarness<EmailInterface>();
    const configured = new EmailInterface({
      transport: "resend",
      apiKey: "resend-key",
      from: "Rover <setup@example.com>",
    });
    await configuredHarness.installPlugin(configured);
    await configuredHarness.finalizeRegistration();
    expect(configured.type).toBe("interface");
    expect(
      configuredHarness.getMockShell().getChannelRegistry().listDescriptors(),
    ).toEqual([
      {
        type: "email",
        displayName: "Email",
        subjectLabel: "Email address",
        subjectPattern: {
          source: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
          flags: "i",
        },
        manualDelivery: true,
      },
    ]);
    const provider = configuredHarness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("email");
    expect(await provider?.isAvailable()).toBe(true);

    const disabledHarness = createPluginHarness<EmailInterface>();
    await disabledHarness.installPlugin(new EmailInterface());
    await disabledHarness.finalizeRegistration();
    expect(
      disabledHarness
        .getMockShell()
        .getChannelRegistry()
        .getDescriptor("email"),
    ).toBeDefined();
    expect(
      disabledHarness
        .getMockShell()
        .getChannelRegistry()
        .getDeliveryProvider("email"),
    ).toBeUndefined();
    expect(
      disabledHarness.getMockShell().getDaemonRegistry().getByPlugin("email"),
    ).toHaveLength(0);
  });

  it("validates inbound config and applies polling defaults", async () => {
    expect(
      () =>
        new EmailInterface({
          imap: { ...imapConfig, port: 0 },
        }),
    ).toThrow(/Invalid plugin config for email/);
    expect(
      () =>
        new EmailInterface({
          imap: { ...imapConfig, pollIntervalMs: 0 },
        }),
    ).toThrow(/Invalid plugin config for email/);

    const client: InboundEmailClient = {
      connect: mock(async () => {}),
      selectMailbox: mock(async () => {}),
      fetchMessages: async function* (): AsyncGenerator<
        InboundEmailSourceMessage,
        void,
        unknown
      > {},
      waitForChanges: waitForAbort,
      disconnect: mock(async () => {}),
    };
    const imapClientFactory = mock(
      (_config: EmailImapConfig): InboundEmailClient => client,
    );
    const harness = createPluginHarness<EmailInterface>();
    await harness.installPlugin(
      new EmailInterface(
        {
          imap: {
            host: imapConfig.host,
            port: String(imapConfig.port),
            user: imapConfig.user,
            password: imapConfig.password,
            pollIntervalMs: String(imapConfig.pollIntervalMs),
          },
        },
        { imapClientFactory },
      ),
    );

    await harness.getMockShell().getDaemonRegistry().startPlugin("email");

    expect(imapClientFactory).toHaveBeenCalledWith({
      ...imapConfig,
      mailbox: "INBOX",
    });
    expect(client.selectMailbox).toHaveBeenCalledWith("INBOX");
    await harness.getMockShell().getDaemonRegistry().stopPlugin("email");
  });

  it("connects, selects the mailbox, and disconnects without logging secrets", async () => {
    const lifecycle: string[] = [];
    const client: InboundEmailClient = {
      connect: mock(async () => {
        lifecycle.push("connect");
      }),
      selectMailbox: mock(async () => {
        lifecycle.push("select");
      }),
      fetchMessages: async function* (): AsyncGenerator<
        InboundEmailSourceMessage,
        void,
        unknown
      > {},
      waitForChanges: waitForAbort,
      disconnect: mock(async () => {
        lifecycle.push("disconnect");
      }),
    };
    const logger = createMockLogger();
    const harness = createPluginHarness<EmailInterface>({ logger });
    await harness.installPlugin(
      new EmailInterface(
        { imap: imapConfig },
        { imapClientFactory: (): InboundEmailClient => client },
      ),
    );
    const registry = harness.getMockShell().getDaemonRegistry();

    expect(registry.getByPlugin("email")).toHaveLength(1);
    await registry.startPlugin("email");
    await registry.stopPlugin("email");

    expect(lifecycle).toEqual(["connect", "select", "disconnect"]);
    expect(client.selectMailbox).toHaveBeenCalledWith("Private Inbox");
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "Inbound email listener connected",
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "Inbound email listener disconnected",
    );
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it("redacts IMAP startup errors and cleans up the client", async () => {
    const leakedError = Object.values(imapConfig).join("|");
    const disconnect = mock(async () => {});
    const client: InboundEmailClient = {
      connect: mock(async () => {
        throw new Error(leakedError);
      }),
      selectMailbox: mock(async () => {}),
      fetchMessages: async function* (): AsyncGenerator<
        InboundEmailSourceMessage,
        void,
        unknown
      > {},
      waitForChanges: waitForAbort,
      disconnect,
    };
    const logger = createMockLogger();
    const harness = createPluginHarness<EmailInterface>({ logger });
    await harness.installPlugin(
      new EmailInterface(
        { imap: imapConfig },
        { imapClientFactory: (): InboundEmailClient => client },
      ),
    );

    const startupError = await harness
      .getMockShell()
      .getDaemonRegistry()
      .startPlugin("email")
      .then(
        (): undefined => undefined,
        (error: unknown): unknown => error,
      );

    expect(startupError).toBeInstanceOf(Error);
    expect(startupError).toHaveProperty(
      "message",
      "Inbound email listener failed to start",
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
    for (const value of [
      imapConfig.host,
      imapConfig.user,
      imapConfig.password,
      imapConfig.mailbox,
    ]) {
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining(value),
      );
    }
  });

  it("declares optional inbound IMAP environment variables", () => {
    const inboundNames = [
      "IMAP_HOST",
      "IMAP_PORT",
      "IMAP_USER",
      "IMAP_PASSWORD",
      "IMAP_MAILBOX",
      "POLL_MODE",
      "POLL_INTERVAL_MS",
    ];
    const inboundDeclarations = emailEnvSchema.filter((declaration) =>
      inboundNames.includes(declaration.name),
    );

    expect(inboundDeclarations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "IMAP_HOST" }),
        expect.objectContaining({ name: "IMAP_PORT" }),
        expect.objectContaining({ name: "IMAP_USER", sensitive: true }),
        expect.objectContaining({ name: "IMAP_PASSWORD", sensitive: true }),
        expect.objectContaining({ name: "IMAP_MAILBOX" }),
        expect.objectContaining({ name: "POLL_MODE" }),
        expect.objectContaining({ name: "POLL_INTERVAL_MS" }),
      ]),
    );
    expect(inboundDeclarations).toHaveLength(inboundNames.length);
    expect(
      inboundDeclarations.every((declaration) => declaration.required !== true),
    ).toBe(true);
  });

  it("sends through the registered delivery provider", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request) =>
        new Response(JSON.stringify({ id: "resend_123" }), { status: 200 }),
    );
    const harness = createPluginHarness<EmailInterface>();

    await harness.installPlugin(
      new EmailInterface(
        {
          transport: "resend",
          apiKey: "resend-key",
          from: "Rover <setup@example.com>",
        },
        { fetchImpl },
      ),
    );
    await harness.finalizeRegistration();

    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("email");
    const result = await provider?.send({
      recipient: "user@example.com",
      subject: "Set up your Rover",
      text: "Open the setup link.",
      html: "<p>Open the setup link.</p>",
      idempotencyKey: "invitation_attempt_1",
      sensitivity: "normal",
    });

    expect(result).toEqual({
      status: "sent",
      providerDeliveryId: "resend_123",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer resend-key",
        "Content-Type": "application/json",
        "Idempotency-Key": "invitation_attempt_1",
      },
      body: JSON.stringify({
        from: "Rover <setup@example.com>",
        to: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the setup link.",
        html: "<p>Open the setup link.</p>",
      }),
    });
  });

  it("returns a generic failure without echoing secret message content", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request) =>
        new Response(JSON.stringify({ message: "provider failed" }), {
          status: 500,
        }),
    );
    const harness = createPluginHarness<EmailInterface>();

    await harness.installPlugin(
      new EmailInterface(
        {
          transport: "resend",
          apiKey: "resend-key",
          from: "Rover <setup@example.com>",
        },
        { fetchImpl },
      ),
    );
    await harness.finalizeRegistration();

    const provider = harness
      .getMockShell()
      .getChannelRegistry()
      .getDeliveryProvider("email");
    const result = await provider?.send({
      recipient: "user@example.com",
      subject: "Set up your Rover",
      text: "SECRET_SETUP_URL",
      idempotencyKey: "attempt_1",
      sensitivity: "secret",
    });

    expect(result).toEqual({
      status: "failed",
      failureCode: "email_delivery_failed",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_SETUP_URL");
  });

  it("redacts failed deliveries unless the caller stated they are normal", () => {
    // Only an explicit opt-out logs the address; an absent value must not.
    expect(shouldRedactDelivery("normal")).toBe(false);
    expect(shouldRedactDelivery("secret")).toBe(true);
    expect(shouldRedactDelivery(undefined)).toBe(true);
  });
});
