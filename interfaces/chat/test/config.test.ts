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
