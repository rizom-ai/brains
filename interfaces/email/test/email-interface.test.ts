import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";

import { EmailInterface, shouldRedactDelivery } from "../src";

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
