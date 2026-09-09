import { afterEach, describe, expect, it } from "bun:test";
import { PUBLISH_CHANNELS } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createTestEntity } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { expectDefined } from "@brains/utils/expect-defined";
import { z } from "@brains/utils/zod";
import { ButtondownClient } from "../src/lib/buttondown-client";
import {
  handlePublishCompleted,
  type PublishCompletedPayload,
} from "../src/lib/publish-handler";
import {
  installNewsletter,
  jsonResponse,
  stubbableFetch,
} from "./helpers/install";

const logger = createSilentLogger("newsletter-auto-send-test");

function publishedPost(
  id: string,
  title: string,
): ReturnType<typeof createTestEntity> {
  return createTestEntity("post", {
    id,
    content: `# ${title}\n\nThis is the content.`,
    metadata: { title, slug: id, status: "published" },
  });
}

describe("auto-send on publish", () => {
  const network = stubbableFetch();

  describe("handlePublishCompleted", () => {
    const client = (): ButtondownClient =>
      new ButtondownClient({ apiKey: "test-key", doubleOptIn: true }, logger, {
        fetch: network.fetch,
      });
    const payload = (
      entityType: string,
      entityId: string,
    ): PublishCompletedPayload => ({
      entityType,
      entityId,
      result: { id: entityId },
    });
    const reader = (
      entity: ReturnType<typeof createTestEntity> | null,
    ): Parameters<typeof handlePublishCompleted>[2] => ({
      getEntity: async (): Promise<unknown> => entity,
    });

    it("sends the published post to every subscriber", async () => {
      let capturedEmailBody: string | undefined;
      network.stub((_url, options) => {
        capturedEmailBody = z.string().parse(options.body);
        return jsonResponse({
          id: "email-123",
          subject: "My Blog Post",
          status: "sent",
        });
      });

      const result = await handlePublishCompleted(
        payload("post", "post-1"),
        client(),
        reader(publishedPost("post-1", "My Blog Post")),
        logger,
      );

      expect(result).toEqual({ success: true, emailId: "email-123" });
      expect(capturedEmailBody).toContain("My Blog Post");
      expect(capturedEmailBody).toContain("about_to_send");
    });

    it("skips anything that is not a post", async () => {
      const result = await handlePublishCompleted(
        payload("deck", "deck-1"),
        client(),
        reader(null),
        logger,
      );

      expect(result).toMatchObject({ success: true, skipped: true });
    });

    it("fails when the post is gone", async () => {
      const result = await handlePublishCompleted(
        payload("post", "non-existent"),
        client(),
        reader(null),
        logger,
      );

      expect(result).toEqual({
        success: false,
        error: "Post non-existent not found",
        code: "not_found",
      });
    });

    it("reports a Buttondown refusal as the failure", async () => {
      network.stub(() => jsonResponse({ detail: "Server error" }, 500));

      const result = await handlePublishCompleted(
        payload("post", "post-1"),
        client(),
        reader(publishedPost("post-1", "Test")),
        logger,
      );

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain("Server error");
    });
  });

  describe("publish:completed subscription", () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("newsletter-auto-send-bus-test"),
    });

    afterEach(async () => {
      await harness.reset();
    });

    it("propagates a failed send to the bus response", async () => {
      await installNewsletter(
        harness,
        { apiKey: "test-key", autoSendOnPublish: true },
        { fetch: network.fetch },
      );

      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: PUBLISH_CHANNELS.completed,
          payload: {
            entityType: "post",
            entityId: "missing-post",
            result: { id: "missing-post" },
          },
          sender: "test",
        });

      expect(response).toMatchObject({ success: false });
      const failure = expectDefined(
        "error" in response ? response : undefined,
        "failure response carrying an error",
      );
      expect(failure.error).toContain("not found");
    });

    it("sends the post when one it can read is published", async () => {
      network.stub(() =>
        jsonResponse({ id: "email-7", subject: "Hello", status: "sent" }),
      );
      await installNewsletter(
        harness,
        { apiKey: "test-key", autoSendOnPublish: true },
        { fetch: network.fetch },
      );
      harness.addEntities([publishedPost("post-7", "Hello")]);

      const response = await harness.sendMessage(PUBLISH_CHANNELS.completed, {
        entityType: "post",
        entityId: "post-7",
        result: { id: "post-7" },
      });

      expect(response).toEqual({ success: true, emailId: "email-7" });
    });

    it("listens to nothing unless auto-send is switched on", async () => {
      let sends = 0;
      network.stub(() => {
        sends += 1;
        return jsonResponse({ id: "email-x", subject: "x", status: "sent" });
      });
      await installNewsletter(
        harness,
        { apiKey: "test-key" },
        { fetch: network.fetch },
      );
      harness.addEntities([publishedPost("post-1", "Hello")]);

      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: PUBLISH_CHANNELS.completed,
          payload: {
            entityType: "post",
            entityId: "post-1",
            result: { id: "post-1" },
          },
          sender: "test",
        });

      // Nobody answered, which the bus says in the answer itself, and no
      // email was attempted.
      expect(response).toMatchObject({ success: false, code: "no_handler" });
      expect(sends).toBe(0);
    });
  });
});
