import { describe, expect, it, mock } from "bun:test";
import { EMAIL_SEND, type SendEmailPayload } from "@brains/email-contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { EmailResendPlugin, type EmailSendResult } from "../src";

describe("EmailResendPlugin", () => {
  it("sends generic email messages through Resend", async () => {
    const fetchImpl = mock(
      async (_input: string | URL | Request) =>
        new Response(JSON.stringify({ id: "resend_123" }), { status: 200 }),
    );
    const harness = createPluginHarness<EmailResendPlugin>();

    await harness.installPlugin(
      new EmailResendPlugin(
        {
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
      },
    );

    expect(result).toEqual({ status: "sent", id: "resend_123" });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer resend-key",
        "Content-Type": "application/json",
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
    const harness = createPluginHarness<EmailResendPlugin>();

    await harness.installPlugin(
      new EmailResendPlugin(
        {
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
        },
      });

    expect("success" in response && response.success).toBe(false);
    expect("error" in response ? response.error : undefined).toBe(
      "Email delivery failed",
    );
    expect(JSON.stringify(response)).not.toContain("SECRET_SETUP_URL");
  });
});
