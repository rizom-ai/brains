import { afterEach, describe, expect, it } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  installNewsletter,
  jsonResponse,
  stubbableFetch,
} from "./helpers/install";

const SUBSCRIBE_PATH = "/api/newsletter/subscribe";
const ORIGIN = "https://brain.test";

/**
 * The signup form posts here: as a fetch with `Accept: application/json` when
 * scripts run, as a plain form submission when they do not. Both go through
 * the one route the service declares once Buttondown is configured.
 */
describe("POST /api/newsletter/subscribe", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("newsletter-route-test"),
  });
  const network = stubbableFetch();

  afterEach(async () => {
    await harness.reset();
  });

  async function subscribeRoute(
    config: { apiKey?: string } = { apiKey: "test-key" },
  ): Promise<WebRouteDefinition | undefined> {
    const { service } = await installNewsletter(harness, config, {
      fetch: network.fetch,
    });
    return service
      .getWebRoutes?.()
      .find(
        (route) => route.path === SUBSCRIBE_PATH && route.method === "POST",
      );
  }

  function formPost(
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ): Request {
    const body = new URLSearchParams(fields);
    return new Request(`${ORIGIN}${SUBSCRIBE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body,
    });
  }

  it("is served publicly, and only once Buttondown is configured", async () => {
    const route = await subscribeRoute();
    expect(route?.public).toBe(true);
    await harness.reset();

    expect(await subscribeRoute({})).toBeUndefined();
  });

  it("answers a scripted form with the subscription as JSON", async () => {
    network.stub(() =>
      jsonResponse({
        id: "sub-123",
        email: "test@example.com",
        subscriber_type: "unactivated",
      }),
    );
    const route = await subscribeRoute();

    const response = await route?.handler(
      formPost({ email: "test@example.com" }, { accept: "application/json" }),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      success: true,
      data: {
        subscriberId: "sub-123",
        email: "test@example.com",
        status: "unactivated",
        message: "subscribed",
      },
    });
  });

  it("tells a scripted form when the address was already subscribed", async () => {
    network.stub(() =>
      jsonResponse({
        id: "sub-123",
        email: "test@example.com",
        subscriber_type: "already_subscribed",
      }),
    );
    const route = await subscribeRoute();

    const response = await route?.handler(
      formPost({ email: "test@example.com" }, { accept: "application/json" }),
    );

    expect(await response?.json()).toMatchObject({
      success: true,
      data: { message: "already_subscribed" },
    });
  });

  it("accepts a JSON body from an API caller", async () => {
    let capturedBody: unknown;
    network.stub((_url, options) => {
      capturedBody = JSON.parse(String(options.body));
      return jsonResponse({
        id: "sub-9",
        email: "api@example.com",
        subscriber_type: "unactivated",
      });
    });
    const route = await subscribeRoute();

    const response = await route?.handler(
      new Request(`${ORIGIN}${SUBSCRIBE_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ email: "api@example.com", name: "Api" }),
      }),
    );

    expect(response?.status).toBe(200);
    expect(capturedBody).toMatchObject({
      email_address: "api@example.com",
      metadata: { name: "Api" },
    });
  });

  it("redirects a plain form submission to the thanks page", async () => {
    network.stub(() =>
      jsonResponse({
        id: "sub-123",
        email: "a@example.com",
        subscriber_type: "unactivated",
      }),
    );
    const route = await subscribeRoute();

    const response = await route?.handler(formPost({ email: "a@example.com" }));

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/subscribe/thanks");
  });

  it("redirects a plain form submission that fails to the error page", async () => {
    network.stub(() => jsonResponse({ detail: "Blocked" }, 400));
    const route = await subscribeRoute();

    const response = await route?.handler(formPost({ email: "a@example.com" }));

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/subscribe/error");
  });

  it("reports a Buttondown refusal to a scripted form as an error it can show", async () => {
    network.stub(() => jsonResponse({ detail: "Blocked" }, 400));
    const route = await subscribeRoute();

    const response = await route?.handler(
      formPost({ email: "a@example.com" }, { accept: "application/json" }),
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({
      success: false,
      error: expect.stringContaining("Blocked"),
    });
  });

  it("refuses a submission without an address before reaching Buttondown", async () => {
    let calls = 0;
    network.stub(() => {
      calls += 1;
      return jsonResponse({});
    });
    const route = await subscribeRoute();

    const response = await route?.handler(
      formPost({ name: "Nobody" }, { accept: "application/json" }),
    );

    expect(response?.status).toBe(400);
    expect(calls).toBe(0);
  });
});
