import { afterEach, describe, expect, it } from "bun:test";
import { PUBLISH_CHANNELS } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import type { PublishProvider } from "@brains/sdk/services";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  installNewsletter,
  jsonResponse,
  stubbableFetch,
} from "./helpers/install";

const registrationSchema = z.object({
  entityType: z.string(),
  provider: z.custom<PublishProvider>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof Reflect.get(value, "publish") === "function",
  ),
});

/**
 * Publishing a newsletter is sending it. The service hands the publish
 * pipeline a provider built on the Buttondown client, and the pipeline
 * records the email id on the entity.
 */
describe("Buttondown publish provider", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("newsletter-publish-test"),
  });
  const network = stubbableFetch();

  afterEach(async () => {
    await harness.reset();
  });

  async function provider(): Promise<PublishProvider> {
    const registrations: unknown[] = [];
    harness.subscribe(PUBLISH_CHANNELS.register, async (message) => {
      registrations.push(message.payload);
      return { success: true };
    });
    await installNewsletter(
      harness,
      { apiKey: "test-key" },
      { fetch: network.fetch },
    );
    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 2 },
      "shell",
      true,
    );
    const registration = registrationSchema.parse(registrations[0]);
    expect(registration.entityType).toBe("newsletter");
    return registration.provider;
  }

  it("sends the issue as an email about to go out and answers with its id", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    network.stub((url, init) => {
      requests.push({ url, body: JSON.parse(String(init.body)) });
      return jsonResponse({
        id: "email-42",
        subject: "Issue 7",
        status: "about_to_send",
      });
    });
    const buttondown = await provider();

    const result = await buttondown.publish("Hello subscribers", {
      subject: "Issue 7",
    });

    expect(result).toEqual({ id: "email-42" });
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

  it("fails the publish when Buttondown rejects the email", async () => {
    network.stub(() => jsonResponse({ detail: "Upstream down" }, 500));
    const buttondown = await provider();

    const failure = await buttondown
      .publish("Hello subscribers", { subject: "Issue 7" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("Upstream down");
  });
});
