import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { prepareAsset } from "@brains/assets";
import { PermissionService } from "@brains/plugins/test";
import {
  ReceivedEntityFileHttpError,
  type AgentResponse,
} from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { CHAT_FILE_FAILURE_NOTICE } from "../src/file-delivery-failure";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  baseDiscordConfig,
  createMessage,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

const suite = setupChatInterfaceTest();
function unexpected(): never {
  throw new Error("Unexpected buffered or publication operation");
}

const cases: Array<
  [
    "slack" | "discord",
    "response" | "completion" | "claim",
    (
      | "success"
      | "post-failure"
      | "cleanup-failure"
      | "cleanup-log-failure"
      | "received-failure"
      | "unprovisioned"
    ),
  ]
> = [];
for (const platform of ["slack", "discord"] as const) {
  for (const route of ["response", "completion", "claim"] as const) {
    for (const mode of [
      "success",
      "post-failure",
      "cleanup-failure",
      "received-failure",
      "unprovisioned",
    ] as const)
      cases.push([platform, route, mode]);
    if (route === "response")
      cases.push([platform, route, "cleanup-log-failure"]);
  }
}

test.each(cases)(
  "production %s asset delivery: %s / %s never enters buffered SDK upload or replays completion",
  async (platform, route, mode) => {
    const service = suite.harness.getMockShell().getEntityService();
    const asset = prepareAsset(new TextEncoder().encode("fixture image bytes"));
    await service.createEntity({
      entity: {
        id: "native-image",
        entityType: "image",
        visibility: "shared",
        content: asset.ref,
        metadata: {
          mediaType: "image/png",
          filename: "image.png",
          status: route === "response" ? "draft" : "pending",
        },
      },
      preparedAsset: asset,
    });
    service.readAsset = unexpected;
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: `${platform}:*`, level: "trusted" }],
      }),
    );
    const response: AgentResponse = {
      text: "Generated the image.",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      cards: [
        {
          kind: "attachment",
          id: "image-card",
          jobId: "image-job",
          title: "Image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=native-image",
          },
        },
      ],
    };
    const prefix = mode === "received-failure" && route === "response";
    if (prefix && response.cards?.[0]) {
      response.cards.push({ ...response.cards[0], id: "later-card" });
      response.cards.unshift({ ...response.cards[0], id: "prefix-card" });
    }
    suite.agentService.chat.mockResolvedValueOnce(response);
    let active = false;
    let retained = false;
    let loans = 0;
    const failure = new Error(mode);
    const post = mock(
      async (
        input: Parameters<
          NonNullable<typeof service.fileAssets>["postHttp"]
        >[0],
      ) => {
        expect(active).toBe(true);
        expect(input.sourceFile).toBe("/owned/image");
        expect(input.facts).toEqual({
          sizeBytes: asset.sizeBytes,
          sha256: asset.digest,
        });
        expect(input.headers).toEqual(
          platform === "slack"
            ? { "content-type": "application/octet-stream" }
            : { authorization: "Bot discord-token" },
        );
        if (platform === "discord") {
          expect(input.url).toBe(
            "https://discord.com/api/v10/channels/333/messages",
          );
          expect(input.multipart).toEqual({
            fieldName: "files[0]",
            filename: "image.png",
            mimeType: "image/png",
            fields: {
              payload_json: JSON.stringify({
                attachments: [{ id: 0, filename: "image.png" }],
                allowed_mentions: { parse: [] },
              }),
            },
          });
        }
        if (mode === "post-failure") throw failure;
        const outcome = {
          ...input.facts,
          statusCode: 200,
          ...(platform === "discord" && {
            responseMetadata: {
              messageId: "987",
              channelId: "333",
              attachmentId: "654",
              attachmentCount: 1,
              filename: "image.png",
              sizeBytes: asset.sizeBytes,
            },
          }),
        };
        if (mode === "received-failure" && (!prefix || loans === 2))
          throw new ReceivedEntityFileHttpError(outcome, failure);
        return outcome;
      },
    );
    const files: NonNullable<typeof service.fileAssets> = {
      withAssetFile: async (ref, use) => {
        expect(ref).toBe(asset.ref);
        loans++;
        active = true;
        try {
          const result = await use(
            {
              sourceFile: "/owned/image",
              sizeBytes: asset.sizeBytes,
              sha256: asset.digest,
            },
            new AbortController().signal,
          );
          if (mode === "cleanup-failure" || mode === "cleanup-log-failure")
            throw failure;
          return result;
        } catch (error) {
          retained = true;
          throw error;
        } finally {
          active = false;
        }
      },
      postHttp: post,
      putHttp: unexpected,
      inspect: unexpected,
      fingerprint: unexpected,
      publish: unexpected,
      download: unexpected,
      close: async (): Promise<void> => undefined,
    };
    if (mode !== "unprovisioned") service.fileAssets = files;
    const thread = createThread({
      id: platform === "slack" ? "slack:C123:123.456" : "discord:111:222:333",
      channelId: platform === "slack" ? "slack:C123" : "discord:111:222",
      adapter: { name: platform },
    });
    const metadata = mock(
      async (url: string | URL | Request): Promise<Response> => {
        expect(active).toBe(true);
        expect(thread.post).toHaveBeenCalled();
        if (String(url).endsWith("files.getUploadURLExternal"))
          return Response.json({
            ok: true,
            file_id: "F123",
            upload_url: "http://127.0.0.1/upload",
          });
        expect(String(url)).toBe(
          "https://slack.com/api/files.completeUploadExternal",
        );
        return Response.json({ ok: true, files: [{ id: "F123" }] });
      },
    );
    const plugin = new ChatInterface(
      {
        adapters:
          platform === "slack"
            ? { slack: baseSlackConfig }
            : { discord: baseDiscordConfig },
      },
      undefined,
      { fetch: metadata },
    );
    const logger = createMockLogger();
    const logError = mock((..._args: unknown[]): void => {
      if (mode === "cleanup-log-failure")
        throw new Error("diagnostic sink failed");
    });
    logger.error = logError;
    suite.harness.getMockShell().getLogger().child = (): typeof logger =>
      logger;
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const mention = chat?.handlers.mentions[0];
    assert.ok(mention);
    if (mode === "cleanup-log-failure")
      await assert.rejects(
        async (): Promise<void> => {
          await mention(thread, createMessage());
        },
        { message: "Chat delivery and failure reporting failed" },
      );
    else await mention(thread, createMessage());
    if (platform === "slack" && route === "response" && mode === "success")
      expect(thread.post).toHaveBeenCalledTimes(1);
    if (route !== "response") {
      expect(loans).toBe(0);
      const entity = await service.getEntity({
        entityType: "image",
        id: "native-image",
      });
      assert.ok(entity);
      await service.updateEntity({
        entity: {
          ...entity,
          metadata: { ...entity.metadata, status: "draft" },
        },
      });
    }
    if (route === "claim") {
      suite.agentService.chat.mockResolvedValueOnce({
        ...response,
        cards: response.cards?.map((card) => ({ ...card, id: "ready-card" })),
      });
      await mention(thread, createMessage({ id: "second-message" }));
    }
    for (let index = 0; index < 2; index++) {
      await suite.harness.sendMessage("job-progress", {
        id: "image-job",
        type: "job",
        status: "completed",
        message: "Done",
        metadata: {
          rootJobId: "image-job",
          operationType: "content_operations",
          operationTarget: "Image",
          interfaceType: platform,
          channelId: thread.id,
        },
      });
    }
    expect(loans).toBe(mode === "unprovisioned" ? 0 : prefix ? 2 : 1);
    expect(post).toHaveBeenCalledTimes(
      mode === "unprovisioned" ? 0 : prefix ? 2 : 1,
    );
    expect(metadata).toHaveBeenCalledTimes(
      mode === "unprovisioned" || platform === "discord"
        ? 0
        : mode === "post-failure" || mode === "received-failure"
          ? prefix
            ? 3
            : 1
          : 2,
    );
    expect(active).toBe(false);
    expect(retained).toBe(
      mode === "post-failure" ||
        mode === "cleanup-failure" ||
        mode === "cleanup-log-failure" ||
        mode === "received-failure",
    );
    if (
      mode === "cleanup-failure" ||
      mode === "cleanup-log-failure" ||
      mode === "received-failure"
    ) {
      const logs = JSON.stringify(logError.mock.calls);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logs).toContain(
        mode === "cleanup-failure" || mode === "cleanup-log-failure"
          ? "acknowledged"
          : platform === "discord"
            ? "received"
            : "upload-received",
      );
      expect(logs).not.toContain("/owned/image");
      expect(logs).not.toContain("127.0.0.1");
      if (prefix) {
        expect(logs).toContain('"deliveredCardIds":["prefix-card"]');
        expect(logs).not.toContain(
          '"deliveredCardIds":["prefix-card","image-card"]',
        );
      }
      if (route !== "completion")
        expect(JSON.stringify(thread.post.mock.calls)).toContain(
          CHAT_FILE_FAILURE_NOTICE,
        );
    }
    for (const [message] of thread.post.mock.calls) {
      if (typeof message !== "string") expect(message.files).toBeUndefined();
    }
  },
);
