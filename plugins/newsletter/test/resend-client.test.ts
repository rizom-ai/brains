import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  ResendApiError,
  ResendNewsletterClient,
  type ResendClientConfig,
  type ResendFetch,
} from "../src/resend/resend-client";

const logger = createSilentLogger("resend-newsletter-test");
const config: ResendClientConfig = {
  apiKey: "resend-key",
  segmentId: "segment-1",
  from: "Rizom <newsletter@example.com>",
};

let fetchFn: ResendFetch = () =>
  Promise.reject(new Error("fetch called without a stub"));
const delegatingFetch: ResendFetch = (url, init) => fetchFn(url, init);

function stubFetch(handler: ResendFetch): void {
  fetchFn = handler;
}

function createClient(
  clientConfig: ResendClientConfig = config,
): ResendNewsletterClient {
  return new ResendNewsletterClient(clientConfig, logger, {
    fetch: delegatingFetch,
  });
}

describe("ResendNewsletterClient", () => {
  it("creates a new contact in the configured segment", async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    stubFetch((url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith("/contacts/new%40example.com")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: "Contact not found" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "contact-1", object: "contact" }),
      });
    });

    const result = await createClient({
      ...config,
      topicId: "topic-1",
    }).subscribe({
      email: "new@example.com",
      name: "Ada Lovelace",
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(result.contact).toMatchObject({
      id: "contact-1",
      email: "new@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      unsubscribed: false,
    });
    expect(JSON.parse(String(requests[1]?.options.body))).toMatchObject({
      email: "new@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
      unsubscribed: false,
      segments: [{ id: "segment-1" }],
      topics: [{ id: "topic-1", subscription: "opt_in" }],
    });
  });

  it("treats an active contact already in the segment as subscribed", async () => {
    const methods: string[] = [];
    stubFetch((url, options) => {
      methods.push(options.method ?? "GET");
      if (String(url).includes("/segments?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              object: "list",
              has_more: false,
              data: [{ id: "segment-1" }],
            }),
        });
      }
      if (options.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "contact-1" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "contact-1",
            email: "existing@example.com",
            unsubscribed: false,
          }),
      });
    });

    const result = await createClient().subscribe({
      email: "existing@example.com",
    });

    expect(result.alreadySubscribed).toBe(true);
    expect(methods).toEqual(["GET", "GET", "PATCH"]);
  });

  it("restores segment membership for an existing contact", async () => {
    const requests: string[] = [];
    stubFetch((url, options) => {
      requests.push(`${options.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("/segments?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ object: "list", has_more: false, data: [] }),
        });
      }
      if (options.method === "PATCH" || options.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: "contact-1" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "contact-1",
            email: "returning@example.com",
            unsubscribed: true,
          }),
      });
    });

    const result = await createClient().subscribe({
      email: "returning@example.com",
    });

    expect(result.alreadySubscribed).toBe(false);
    expect(requests.at(-1)).toBe(
      "POST https://api.resend.com/contacts/returning%40example.com/segments/segment-1",
    );
  });

  it("removes a subscriber only from the configured segment", async () => {
    let request: { url: string; method: string | undefined } | undefined;
    stubFetch((url, options) => {
      request = { url: String(url), method: options.method };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ deleted: true }),
      });
    });

    await createClient().unsubscribe("reader@example.com");

    expect(request).toEqual({
      url: "https://api.resend.com/contacts/reader%40example.com/segments/segment-1",
      method: "DELETE",
    });
  });

  it("lists contacts from the configured segment with bounded limits", async () => {
    let requestedUrl = "";
    stubFetch((url) => {
      requestedUrl = String(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            object: "list",
            has_more: true,
            data: [
              {
                id: "contact-1",
                email: "reader@example.com",
                first_name: null,
                last_name: null,
                unsubscribed: false,
              },
            ],
          }),
      });
    });

    const result = await createClient().listContacts({ limit: 500 });

    expect(requestedUrl).toBe(
      "https://api.resend.com/segments/segment-1/contacts?limit=100",
    );
    expect(result).toEqual({
      contacts: [
        {
          id: "contact-1",
          email: "reader@example.com",
          unsubscribed: false,
        },
      ],
      hasMore: true,
    });
  });

  it("creates and immediately sends a broadcast", async () => {
    let request: { options: RequestInit } | undefined;
    stubFetch((_url, options) => {
      request = { options };
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: "broadcast-1" }),
      });
    });

    const result = await createClient({
      ...config,
      replyTo: "reply@example.com",
      topicId: "topic-1",
    }).createBroadcast({
      subject: "Weekly update",
      html: "<p>Hello</p>",
      text: "Hello",
      previewText: "Preview",
    });

    expect(result).toEqual({ id: "broadcast-1" });
    expect(request?.options.headers).toMatchObject({
      Authorization: "Bearer resend-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request?.options.body))).toEqual({
      segment_id: "segment-1",
      from: "Rizom <newsletter@example.com>",
      subject: "Weekly update",
      html: "<p>Hello</p>",
      text: "Hello",
      send: true,
      preview_text: "Preview",
      reply_to: ["reply@example.com"],
      topic_id: "topic-1",
    });
  });

  it("preserves structured Resend API errors", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ name: "validation_error", message: "Bad segment" }),
      }),
    );

    const promise = createClient().createBroadcast({
      subject: "Weekly update",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(promise).rejects.toBeInstanceOf(ResendApiError);
    expect(promise).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
    });
  });
});
