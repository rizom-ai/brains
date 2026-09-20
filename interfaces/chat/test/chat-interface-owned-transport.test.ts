import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAsset } from "@brains/assets";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import { PermissionService } from "@brains/plugins/test";
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
  throw new Error("Unexpected buffered/publication operation");
}

test.each(["slack", "discord"] as const)(
  "production %s caller lends its file through real HTTP actor exit and acknowledgement",
  async (platform) => {
    const directory = await mkdtemp(join(tmpdir(), "chat-owned-http-"));
    const sourceFile = join(directory, "source");
    const bytes = Uint8Array.from(
      { length: 96 * 1024 + 7 },
      (_, index) => (index * 11 + Math.floor(index / 32768) * 31) % 251,
    );
    const asset = prepareAsset(bytes);
    await writeFile(sourceFile, bytes);
    const received = Promise.withResolvers<{
      bytes: Buffer;
      mimeType: string;
    }>();
    let requests = 0;
    const server = createServer((request, response) => {
      requests++;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.resolve({
          bytes: Buffer.concat(chunks),
          mimeType: request.headers["content-type"] ?? "",
        });
        response.end(
          platform === "discord"
            ? JSON.stringify({
                id: "987",
                channel_id: "333",
                attachments: [
                  { id: "654", filename: "fixture.png", size: bytes.length },
                ],
              })
            : "ok",
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/upload`;
    const actor = new URL(
      import.meta.resolve("@brains/db/file-http-upload-process"),
    );
    const owner = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      httpUploadUrl: actor,
    });
    let active = false;
    let shared = false;
    const service = suite.harness.getMockShell().getEntityService();
    const files: NonNullable<typeof service.fileAssets> = {
      withAssetFile: async (ref, use, options) => {
        expect(ref).toBe(asset.ref);
        active = true;
        try {
          const result = await use(
            { sourceFile, sha256: asset.digest, sizeBytes: asset.sizeBytes },
            options?.signal ?? new AbortController().signal,
          );
          expect(owner.stats().children).toBe(0);
          if (platform === "slack") expect(shared).toBe(true);
          await unlink(sourceFile);
          return result;
        } finally {
          active = false;
        }
      },
      postHttp: async (input, options) => {
        expect(active).toBe(true);
        if (platform === "discord")
          expect(input.url).toBe(
            "https://discord.com/api/v10/channels/333/messages",
          );
        else expect(input.url).toBe(url);
        // Only the injected test collaborator redirects the fixed Discord endpoint.
        const result = await owner.post({ ...input, url }, options?.signal);
        expect(await Bun.file(sourceFile).exists()).toBe(true);
        expect(owner.stats().children).toBe(0);
        return result;
      },
      putHttp: unexpected,
      inspect: unexpected,
      fingerprint: unexpected,
      publish: unexpected,
      download: unexpected,
      close: async (): Promise<void> => undefined,
    };
    service.fileAssets = files;
    service.readAsset = unexpected;
    try {
      await service.createEntity({
        entity: {
          id: "native-image",
          entityType: "image",
          visibility: "shared",
          content: asset.ref,
          metadata: { mediaType: "image/png", filename: "fixture.png" },
        },
        preparedAsset: asset,
      });
      suite.harness.setPermissionService(
        new PermissionService({
          rules: [{ pattern: `${platform}:*`, level: "trusted" }],
        }),
      );
      suite.agentService.chat.mockResolvedValueOnce({
        text: "Image ready.",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        cards: [
          {
            kind: "attachment",
            id: "image",
            title: "Image",
            attachment: {
              mediaType: "image/png",
              url: "/api/chat/attachments/image?id=native-image",
            },
          },
        ],
      });
      const plugin = new ChatInterface(
        {
          adapters:
            platform === "slack"
              ? { slack: baseSlackConfig }
              : { discord: baseDiscordConfig },
        },
        undefined,
        {
          fetch: async (input): Promise<Response> => {
            expect(platform).toBe("slack");
            expect(active).toBe(true);
            if (String(input).endsWith("files.getUploadURLExternal"))
              return Response.json({
                ok: true,
                file_id: "F123",
                upload_url: url,
              });
            expect(String(input)).toBe(
              "https://slack.com/api/files.completeUploadExternal",
            );
            expect(await Bun.file(sourceFile).exists()).toBe(true);
            shared = true;
            return Response.json({ ok: true, files: [{ id: "F123" }] });
          },
        },
      );
      await suite.harness.installPlugin(plugin);
      const thread = createThread({
        id: platform === "slack" ? "slack:C123:123.456" : "discord:111:333",
        channelId: platform === "slack" ? "slack:C123" : "discord:111:333",
        adapter: { name: platform },
      });
      const mention = MockChatSdk.instances[0]?.handlers.mentions[0];
      assert.ok(mention);
      await mention(thread, createMessage());
      expect(requests).toBe(1);
      expect(active).toBe(false);
      expect(await Bun.file(sourceFile).exists()).toBe(false);
      const wire = await received.promise;
      if (platform === "slack")
        expect(new Uint8Array(wire.bytes)).toEqual(bytes);
      else {
        const form = await new Request(url, {
          method: "POST",
          headers: { "content-type": wire.mimeType },
          body: new Uint8Array(wire.bytes),
        }).formData();
        const file = form.get("files[0]");
        assert.ok(file instanceof File);
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
        expect(form.get("payload_json")).toBe(
          JSON.stringify({
            attachments: [{ id: 0, filename: "fixture.png" }],
            allowed_mentions: { parse: [] },
          }),
        );
      }
      for (const [message] of thread.post.mock.calls)
        if (typeof message !== "string") expect(message.files).toBeUndefined();
      expect(owner.stats()).toEqual({
        children: 0,
        terminalChildren: 0,
        fenced: false,
      });
    } finally {
      await owner.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(directory, { recursive: true });
    }
  },
);
