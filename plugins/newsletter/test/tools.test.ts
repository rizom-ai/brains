import { afterEach, describe, expect, it } from "bun:test";
import type { PluginCapabilities } from "@brains/plugins";
import {
  createPluginHarness,
  expectError,
  expectSuccess,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { subscribersInputSchema } from "../src/tools";
import {
  installNewsletter,
  jsonResponse,
  stubbableFetch,
} from "./helpers/install";

const TOOL = "buttondown_subscribers";

describe("buttondown_subscribers", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("newsletter-tools-test"),
  });
  const network = stubbableFetch();

  afterEach(async () => {
    await harness.reset();
  });

  async function install(
    config: { apiKey?: string } = { apiKey: "test-key" },
  ): Promise<PluginCapabilities> {
    const { capabilities } = await installNewsletter(harness, config, {
      fetch: network.fetch,
    });
    return capabilities;
  }

  it("uses OpenAI-compatible email patterns in the model-visible schema", () => {
    const jsonSchema = z.toJSONSchema(subscribersInputSchema);
    expect(JSON.stringify(jsonSchema)).not.toContain("(?!");
  });

  it("is the one tool the service offers, and only once Buttondown is configured", async () => {
    const configured = await install();
    expect(configured.tools.map((tool) => tool.name)).toEqual([TOOL]);
    await harness.reset();

    const unconfigured = await install({});
    expect(unconfigured.tools).toEqual([]);
  });

  describe("subscribe", () => {
    it("subscribes an address through the Buttondown API", async () => {
      network.stub(() =>
        jsonResponse({
          id: "sub-123",
          email: "test@example.com",
          subscriber_type: "unactivated",
        }),
      );
      await install();

      const result = await harness.executeTool(TOOL, {
        action: "subscribe",
        email: "test@example.com",
      });

      expectSuccess(result);
      expect(result.data).toMatchObject({
        subscriberId: "sub-123",
        email: "test@example.com",
        message: "subscribed",
      });
    });

    it("sends the name along when given one", async () => {
      let capturedBody: string | undefined;
      network.stub((_url, options) => {
        capturedBody = z.string().parse(options.body);
        return jsonResponse({
          id: "sub-123",
          email: "test@example.com",
          subscriber_type: "unactivated",
        });
      });
      await install();

      await harness.executeTool(TOOL, {
        action: "subscribe",
        email: "test@example.com",
        name: "Test User",
      });

      expect(capturedBody).toContain("Test User");
    });

    it("surfaces the API's error detail", async () => {
      network.stub(() =>
        jsonResponse({ detail: "This email address is blocked" }, 400),
      );
      await install();

      const result = await harness.executeTool(TOOL, {
        action: "subscribe",
        email: "blocked@example.com",
      });

      expectError(result);
      expect(result.error).toContain("This email address is blocked");
    });

    it("reports an address that is already subscribed", async () => {
      network.stub(() =>
        jsonResponse({
          id: "sub-existing",
          email: "test@example.com",
          subscriber_type: "already_subscribed",
        }),
      );
      await install();

      const result = await harness.executeTool(TOOL, {
        action: "subscribe",
        email: "test@example.com",
      });

      expectSuccess(result);
      expect(result.data).toMatchObject({ message: "already_subscribed" });
    });

    it("refuses to subscribe without an address", async () => {
      await install();

      const result = await harness.executeTool(TOOL, { action: "subscribe" });

      expectError(result);
      expect(result.error).toContain("email is required");
    });
  });

  describe("unsubscribe", () => {
    it("unsubscribes an address through the Buttondown API", async () => {
      const calls: string[] = [];
      network.stub((url) => {
        calls.push(url);
        return jsonResponse({});
      });
      await install();

      const result = await harness.executeTool(TOOL, {
        action: "unsubscribe",
        email: "test@example.com",
      });

      expectSuccess(result);
      expect(result.data).toEqual({ email: "test@example.com" });
      expect(calls.some((url) => url.includes("test%40example.com"))).toBe(
        true,
      );
    });
  });

  describe("list", () => {
    it("lists subscribers from the Buttondown API", async () => {
      network.stub(() =>
        jsonResponse({
          count: 2,
          results: [
            { id: "sub-1", email: "a@example.com", subscriber_type: "regular" },
            { id: "sub-2", email: "b@example.com", subscriber_type: "regular" },
          ],
        }),
      );
      await install();

      const result = await harness.executeTool(TOOL, { action: "list" });

      expectSuccess(result);
      expect(result.data).toEqual({
        count: 2,
        subscribers: [
          { id: "sub-1", email: "a@example.com", status: "regular" },
          { id: "sub-2", email: "b@example.com", status: "regular" },
        ],
      });
    });
  });
});
