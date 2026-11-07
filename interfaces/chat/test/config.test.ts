import { describe, expect, it } from "bun:test";
import { chatConfigSchema } from "../src/config";

describe("Slack chat configuration", () => {
  it("defaults to webhook mode and requires a signing secret", () => {
    const parsed = chatConfigSchema.parse({
      adapters: {
        slack: {
          botToken: "xoxb-test",
          signingSecret: "signing-secret",
        },
      },
    });

    expect(parsed.adapters.slack).toMatchObject({
      botToken: "xoxb-test",
      mode: "webhook",
      signingSecret: "signing-secret",
    });
    expect(
      chatConfigSchema.safeParse({
        adapters: { slack: { botToken: "xoxb-test" } },
      }).success,
    ).toBe(false);
  });

  it("accepts Socket Mode without a signing secret", () => {
    const parsed = chatConfigSchema.parse({
      adapters: {
        slack: {
          botToken: "xoxb-test",
          mode: "socket",
          appToken: "xapp-test",
        },
      },
    });

    expect(parsed.adapters.slack).toMatchObject({
      botToken: "xoxb-test",
      mode: "socket",
      appToken: "xapp-test",
    });
    expect(parsed.adapters.slack?.signingSecret).toBeUndefined();
  });

  it("rejects Socket Mode without an app token", () => {
    const parsed = chatConfigSchema.safeParse({
      adapters: {
        slack: {
          botToken: "xoxb-test",
          mode: "socket",
        },
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("WhatsApp chat configuration", () => {
  it("needs only a phone number and applies the routing defaults", () => {
    const parsed = chatConfigSchema.parse({
      adapters: { whatsapp: { phoneNumber: "31600000001" } },
    });

    expect(parsed.adapters.whatsapp).toEqual({
      phoneNumber: "31600000001",
      allowedChannels: [],
      requireMention: true,
      allowDMs: true,
      showTypingIndicator: true,
      captureUrls: false,
      blockedUrlDomains: expect.arrayContaining(["meet.google.com"]),
    });
  });

  it.each([["+31 6 0000 0001"], ["0600000001x"], ["123"]])(
    "rejects %s as a phone number",
    (phoneNumber) => {
      expect(
        chatConfigSchema.safeParse({ adapters: { whatsapp: { phoneNumber } } })
          .success,
      ).toBe(false);
    },
  );
});
