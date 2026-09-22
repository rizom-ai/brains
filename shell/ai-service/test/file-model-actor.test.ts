import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { FileProcessOwner } from "@brains/db/file-process-owner";
import { decodeFileModelResult } from "../src/file-model-result";

const vendorRequest = z.looseObject({
  input: z.array(
    z.looseObject({
      content: z.array(
        z.looseObject({ type: z.string(), file_data: z.string().optional() }),
      ),
    }),
  ),
});

test.each([false, true])(
  "native file SDK call joins the actor; rejected acknowledgement=%s",
  async (rejectAcknowledgement) => {
    const directory = await mkdtemp(join(tmpdir(), "file-model-actor-"));
    const bytes = Buffer.alloc(256 * 1024 + 7, 0x5a);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sourceFile = join(directory, "source.pdf");
    const outputFile = join(directory, "receipt.json");
    await writeFile(sourceFile, bytes);
    const token = randomBytes(32).toString("hex");
    let url = "";
    let calls = 0;
    let pid = 0;
    let control = "";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request): Promise<Response> {
        const path = new URL(request.url).pathname;
        if (path === "/responses") {
          // This branch is the external-provider substitute, not the production controller relay.
          calls++;
          pid = Number(request.headers.get("x-fixture-pid"));
          const body = vendorRequest.parse(await request.json());
          const data = body.input
            .flatMap((item) => item.content)
            .find((item) => item.type === "input_file")?.file_data;
          expect(data).toBe(
            `data:application/pdf;base64,${bytes.toString("base64")}`,
          );
          return Response.json({
            id: "response-1",
            object: "response",
            model: "gpt-fixture",
            created_at: 1,
            status: "completed",
            output: [
              {
                id: "message-1",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: "Native PDF received",
                    annotations: [],
                  },
                ],
              },
            ],
            usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
          });
        }
        if (request.headers.get("authorization") !== `Bearer ${token}`)
          return new Response(null, { status: 403 });
        if (path === "/request")
          return Response.json({
            mode: "generate",
            config: { model: "gpt-fixture", apiKey: url },
            call: {
              prompt: [
                {
                  role: "user",
                  content: [
                    {
                      type: "file",
                      filename: "source.pdf",
                      mediaType: "application/pdf",
                      data: "brains-upload:fixture",
                    },
                  ],
                },
              ],
            },
            bindings: [
              {
                reference: "brains-upload:fixture",
                sourceFile,
                sizeBytes: bytes.length,
                sha256,
                filename: "source.pdf",
                mediaType: "application/pdf",
              },
            ],
          });
        if (path === "/response") {
          const body = await request.text();
          const [header, ...lines] = body.trimEnd().split("\n");
          expect(JSON.parse(header ?? "null")).toEqual({
            type: "file-model-response",
            headers: {},
          });
          control = lines.join("\n") + "\n";
          return Response.json({
            frames: lines.length,
            sizeBytes: Buffer.byteLength(control),
            sha256: rejectAcknowledgement
              ? "0".repeat(64)
              : createHash("sha256").update(control).digest("hex"),
          });
        }
        return new Response(null, { status: 404 });
      },
    });
    url = `http://127.0.0.1:${server.port}`;
    const actor = new URL("./fixtures/file-model-actor.ts", import.meta.url);
    const owner = new FileProcessOwner({
      executable: process.execPath,
      uploadUrl: actor,
      downloadUrl: actor,
      producerUrls: { "file-model": actor },
    });
    try {
      const work = owner.produce(
        { sourceDirectory: directory, outputFile, metadata: { url, token } },
        undefined,
        "file-model",
      );
      if (rejectAcknowledgement)
        await assert.rejects(work, /acknowledgement mismatch/);
      else {
        const facts = await work;
        const completion = await readFile(outputFile);
        expect(facts).toEqual({
          sizeBytes: completion.length,
          sha256: createHash("sha256").update(completion).digest("hex"),
        });
        expect(JSON.parse(completion.toString())).toEqual({
          frames: 1,
          sizeBytes: Buffer.byteLength(control),
          sha256: createHash("sha256").update(control).digest("hex"),
        });
      }
      const result = decodeFileModelResult(control.trimEnd());
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Native PDF received",
          providerMetadata: { openai: { itemId: "message-1" } },
        },
      ]);
      expect(result.request).toBeUndefined();
      expect(result.response?.body).toBeUndefined();
      expect(Buffer.byteLength(control)).toBeLessThan(4096);
      expect(calls).toBe(1);
      expect(pid).not.toBe(process.pid);
      expect(pid).toBeGreaterThan(0);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      expect(owner.stats().children).toBe(0);
    } finally {
      await owner.close();
      await server.stop(true);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
