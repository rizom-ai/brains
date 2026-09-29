import { describe, expect, it } from "bun:test";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import { ResendPlugin } from "../src/provider/resend/plugin";
import type { ResendFetch } from "../src/provider/resend/resend-client";

let fetchFn: ResendFetch = () =>
  Promise.reject(new Error("fetch called without a stub"));
const delegatingFetch: ResendFetch = (url, init) => fetchFn(url, init);

function stubFetch(handler: ResendFetch): void {
  fetchFn = handler;
}

describe("Resend newsletter subscriber tool", () => {
  it("subscribes through the canonical newsletter tool", async () => {
    stubFetch((url) => {
      if (String(url).endsWith("/contacts/reader%40example.com")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: "Contact not found" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "contact-1" }),
      });
    });
    const harness = createPluginHarness();
    await harness.installPlugin(
      new ResendPlugin(
        {
          apiKey: "resend-key",
          segmentId: "segment-1",
          from: "Rizom <newsletter@example.com>",
        },
        { fetch: delegatingFetch },
      ),
    );

    const result = await harness.executeTool("newsletter_subscribers", {
      action: "subscribe",
      email: "reader@example.com",
      name: "Reader Example",
    });

    expectSuccess(result);
    expect(result.data).toMatchObject({
      subscriberId: "contact-1",
      email: "reader@example.com",
      status: "regular",
      message: "subscribed",
    });
    await harness.reset();
  });

  it("keeps the public signup tool subscribe-only", async () => {
    const urls: string[] = [];
    stubFetch((url) => {
      urls.push(String(url));
      if (String(url).endsWith("/contacts/public%40example.com")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: "Contact not found" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "contact-public" }),
      });
    });
    const harness = createPluginHarness();
    await harness.installPlugin(
      new ResendPlugin(
        {
          apiKey: "resend-key",
          segmentId: "segment-1",
          from: "Rizom <newsletter@example.com>",
        },
        { fetch: delegatingFetch },
      ),
    );

    const result = await harness.executeTool("newsletter_signup", {
      email: "public@example.com",
      action: "list",
    });

    expectSuccess(result);
    expect(result.data).toMatchObject({
      subscriberId: "contact-public",
      message: "subscribed",
    });
    expect(urls).toEqual([
      "https://api.resend.com/contacts/public%40example.com",
      "https://api.resend.com/contacts",
    ]);
    await harness.reset();
  });
});
