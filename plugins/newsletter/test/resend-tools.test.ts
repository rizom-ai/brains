import { describe, expect, it } from "bun:test";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import { installNewsletter } from "./helpers/install";
import { SUBSCRIBE_PATH } from "../src/routes";

const provider = {
  type: "resend" as const,
  apiKey: "resend-key",
  segmentId: "segment-1",
  from: "Rizom <newsletter@example.com>",
};

describe("Resend newsletter subscriber tool", () => {
  it("subscribes through the declared newsletter tool", async () => {
    const harness = createPluginHarness();
    try {
      await installNewsletter(
        harness,
        { provider },
        {
          fetch: (url) =>
            Promise.resolve({
              ok: !String(url).endsWith("/contacts/reader%40example.com"),
              status: String(url).endsWith("/contacts/reader%40example.com")
                ? 404
                : 201,
              json: async () =>
                String(url).endsWith("/contacts/reader%40example.com")
                  ? { message: "Contact not found" }
                  : { id: "contact-1" },
            }),
        },
      );
      const result = await harness.executeTool("delivery_subscribers", {
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
    } finally {
      await harness.reset();
    }
  });

  it("keeps public signup subscribe-only even when a caller submits action=list", async () => {
    const harness = createPluginHarness();
    try {
      const urls: string[] = [];
      const { service } = await installNewsletter(
        harness,
        { provider },
        {
          fetch: (url) => {
            urls.push(String(url));
            const missing = String(url).endsWith(
              "/contacts/public%40example.com",
            );
            return Promise.resolve({
              ok: !missing,
              status: missing ? 404 : 201,
              json: async () =>
                missing
                  ? { message: "Contact not found" }
                  : { id: "contact-public" },
            });
          },
        },
      );
      const route = service
        .getWebRoutes?.()
        .find(({ path }) => path === SUBSCRIBE_PATH);
      if (!route) throw new Error("Missing public signup route");
      const response = await route.handler(
        new Request(`https://brain.test${SUBSCRIBE_PATH}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ email: "public@example.com", action: "list" }),
        }),
      );
      expect(response.status).toBe(200);
      const result: unknown = await response.json();
      expect(result).toMatchObject({
        success: true,
        data: { subscriberId: "contact-public", message: "subscribed" },
      });
      expect(urls).toEqual([
        "https://api.resend.com/contacts/public%40example.com",
        "https://api.resend.com/contacts",
      ]);
    } finally {
      await harness.reset();
    }
  });
});
