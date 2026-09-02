import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { BUTTONDOWN_CHANNELS } from "../src/buttondown-channels";
import { ButtondownPlugin } from "../src/provider/plugin";
import type { ButtondownFetch } from "../src/provider/lib/buttondown-client";

describe("buttondown:send channel", () => {
  const harness = createPluginHarness();

  afterEach(() => {
    harness.reset();
  });

  it("sends the email through the client and answers with its id", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchFn: ButtondownFetch = (url, init) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "email-42",
            subject: "Issue 7",
            status: "about_to_send",
          }),
      });
    };

    await harness.installPlugin(
      new ButtondownPlugin(
        { apiKey: "test-key", doubleOptIn: true },
        { fetch: fetchFn },
      ),
    );

    const reply = await harness.sendMessage<
      { entityId: string; subject: string; content: string },
      { emailId?: string }
    >(BUTTONDOWN_CHANNELS.send, {
      entityId: "newsletter-7",
      subject: "Issue 7",
      content: "Hello subscribers",
    });

    expect(reply).toEqual({ emailId: "email-42" });
    expect(requests).toEqual([
      {
        url: "https://api.buttondown.email/v1/emails",
        body: {
          subject: "Issue 7",
          body: "Hello subscribers",
          status: "about_to_send",
        },
      },
    ]);
  });

  it("answers without an id when the API rejects the email", async () => {
    let attempts = 0;
    const fetchFn: ButtondownFetch = () => {
      attempts += 1;
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: "Upstream down" }),
      });
    };

    await harness.installPlugin(
      new ButtondownPlugin(
        { apiKey: "test-key", doubleOptIn: true },
        { fetch: fetchFn },
      ),
    );

    const reply = await harness.sendMessage<
      { entityId: string; subject: string; content: string },
      { emailId?: string }
    >(BUTTONDOWN_CHANNELS.send, {
      entityId: "newsletter-7",
      subject: "Issue 7",
      content: "Hello subscribers",
    });

    expect(attempts).toBe(1);
    expect(reply).toBeUndefined();
  });
});
