import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { prepareAsset } from "@brains/assets";
import { PermissionService } from "@brains/plugins/test";
import type { AgentResponse } from "@brains/plugins";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
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
    "response" | "completion" | "claim",
    "success" | "post-failure" | "cleanup-failure" | "unprovisioned",
  ]
> = [];
for (const route of ["response", "completion", "claim"] as const) {
  for (const mode of [
    "success",
    "post-failure",
    "cleanup-failure",
    "unprovisioned",
  ] as const)
    cases.push([route, mode]);
}

test.each(cases)(
  "production Slack asset delivery: %s / %s never enters buffered SDK upload or replays completion",
  async (route, mode) => {
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
        rules: [{ pattern: "slack:*", level: "trusted" }],
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
        expect(input.headers).toEqual({
          "content-type": "application/octet-stream",
        });
        if (mode === "post-failure") throw failure;
        return { ...input.facts, statusCode: 200 };
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
          if (mode === "cleanup-failure") throw failure;
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
      id: "slack:C123:123.456",
      channelId: "slack:C123",
      adapter: { name: "slack" },
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
      { adapters: { slack: baseSlackConfig } },
      undefined,
      { fetch: metadata },
    );
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const mention = chat?.handlers.mentions[0];
    assert.ok(mention);
    await mention(thread, createMessage());
    if (route === "response" && mode === "success")
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
          interfaceType: "slack",
          channelId: thread.id,
        },
      });
    }
    expect(loans).toBe(mode === "unprovisioned" ? 0 : 1);
    expect(post).toHaveBeenCalledTimes(mode === "unprovisioned" ? 0 : 1);
    expect(metadata).toHaveBeenCalledTimes(
      mode === "unprovisioned" ? 0 : mode === "post-failure" ? 1 : 2,
    );
    expect(active).toBe(false);
    expect(retained).toBe(
      mode === "post-failure" || mode === "cleanup-failure",
    );
    for (const [message] of thread.post.mock.calls) {
      if (typeof message !== "string") expect(message.files).toBeUndefined();
    }
  },
);
