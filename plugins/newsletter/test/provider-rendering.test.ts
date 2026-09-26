import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { ButtondownNewsletterProvider } from "../src/buttondown-provider";
import type { ButtondownFetch } from "../src/lib/buttondown-client";
import { ResendNewsletterProvider } from "../src/resend/resend-provider";

const logger = createSilentLogger("newsletter-provider-rendering-test");
const requestBodySchema = z.record(z.string(), z.unknown());

describe("newsletter provider rendering", () => {
  it("sends the same shared HTML document through both providers", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchFn: ButtondownFetch = (url, options) => {
      requests.push({
        url: String(url),
        body: requestBodySchema.parse(JSON.parse(String(options.body))),
      });
      if (String(url).includes("buttondown")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: "buttondown-1",
              subject: "Weekly update",
              status: "sent",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "resend-1" }),
      });
    };

    const content = "# Hello\n\nThis is the **same** newsletter.";
    await new ButtondownNewsletterProvider(
      { apiKey: "buttondown-key", doubleOptIn: true },
      logger,
      { fetch: fetchFn },
    ).publish(content, { subject: "Weekly update" });
    await new ResendNewsletterProvider(
      {
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "Rizom <newsletter@example.com>",
      },
      logger,
      { fetch: fetchFn },
    ).publish(content, { subject: "Weekly update" });

    const buttondownBody = String(requests[0]?.body["body"]);
    const buttondownHtml = buttondownBody.slice(
      buttondownBody.indexOf("<!doctype html>"),
    );
    expect(buttondownHtml).toBe(String(requests[1]?.body["html"]));
    expect(buttondownHtml).toContain("<strong>same</strong>");
  });

  it("rejects Buttondown-only tags for Resend", async () => {
    const provider = new ResendNewsletterProvider(
      {
        apiKey: "resend-key",
        segmentId: "segment-1",
        from: "Rizom <newsletter@example.com>",
      },
      logger,
    );

    expect(
      provider.createSubscriber({
        email: "reader@example.com",
        tags: ["paid"],
      }),
    ).rejects.toThrow("not supported");
  });
});
