import { describe, expect, it, mock } from "bun:test";
import { EMAIL_SEND, type SendEmailPayload } from "@brains/email-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { EmailInterface, type EmailSendResult } from "../src";

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

  it("sends generic email messages through Resend", async () => {
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

    const result = await harness.sendMessage<unknown, EmailSendResult>(
      EMAIL_SEND,
      {
        to: "user@example.com",
        subject: "Set up your Rover",
        text: "Open the setup link.",
        html: "<p>Open the setup link.</p>",
        idempotencyKey: "invitation_attempt_1",
      },
    );

    expect(result).toEqual({ status: "sent", id: "resend_123" });
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

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send<SendEmailPayload, EmailSendResult>({
        type: EMAIL_SEND,
        sender: "test",
        payload: {
          to: "user@example.com",
          subject: "Set up your Rover",
          text: "SECRET_SETUP_URL",
          sensitivity: "secret",
        },
      });

    expect("success" in response && response.success).toBe(false);
    expect("error" in response ? response.error : undefined).toBe(
      "Email delivery failed",
    );
    expect(JSON.stringify(response)).not.toContain("SECRET_SETUP_URL");
  });
});
