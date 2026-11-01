import { afterEach, expect, it, spyOn } from "bun:test";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

const embeddingsRequest = z.object({ input: z.array(z.string()) });
const chatRequest = z.object({ stream: z.boolean().optional() });

/** An OpenAI-compatible model runtime: embeddings and one-line chat replies. */
function startFakeRuntime(): { url: string; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/v1/embeddings") {
        const { input } = embeddingsRequest.parse(await request.json());
        return Response.json({
          object: "list",
          data: input.map((_, index) => ({
            object: "embedding",
            index,
            embedding: Array.from({ length: 768 }, () => 0.036),
          })),
          model: "embeddinggemma-2:270m",
          usage: { prompt_tokens: input.length, total_tokens: input.length },
        });
      }
      if (path === "/v1/chat/completions") {
        const { stream } = chatRequest.parse(await request.json());
        const reply = "Hello from the local runtime.";
        if (stream) {
          const chunks = [
            {
              choices: [
                { index: 0, delta: { role: "assistant", content: reply } },
              ],
            },
            { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
            { choices: [], usage: { prompt_tokens: 10, completion_tokens: 6 } },
          ];
          return new Response(
            `${chunks.map((chunk) => `data: ${JSON.stringify({ id: "c", created: 0, model: "qwen3:8b", ...chunk })}\n\n`).join("")}data: [DONE]\n\n`,
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        return Response.json({
          id: "c",
          created: 0,
          model: "qwen3:8b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: reply },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { url: server.url.origin, stop: () => server.stop(true) };
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it("boots, indexes and answers a chat turn with no cloud provider configured", async () => {
  const runtime = startFakeRuntime();
  cleanups.push(runtime.stop);
  // Every request must reach the model runtime; none may reach a cloud API.
  const realFetch = globalThis.fetch;
  const outside: string[] = [];
  const network = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.startsWith(runtime.url)) outside.push(url);
        return realFetch(input, init);
      },
      { preconnect: (): void => {} },
    ),
  );
  cleanups.push(() => network.mockRestore());

  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  const dir = testDirectory.dir;
  await Promise.all([
    migrateEntities({ url: `file:${dir}/test.db` }),
    migrateJobQueue({ url: `file:${dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${dir}/test-conv.db` }),
    migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` }),
  ]);

  const shell = Shell.createFresh(
    createTestShellConfig(dir, {
      ai: {
        model: "local:qwen3:8b",
        embeddingModel: "local:embeddinggemma-2:270m",
        modelRuntimeUrl: runtime.url,
      },
    }),
    { logger: createSilentLogger("no-cloud-key-boot") },
  );
  cleanups.push(() => shell.shutdown());
  await shell.initialize();

  await shell.getEntityService().createEntity({
    entity: {
      id: "local-note",
      entityType: "note",
      content: "A note indexed by the local runtime",
      metadata: {},
    },
  });
  const status = await shell
    .getEntityService()
    .awaitIndexReady({ timeoutMs: 10_000 });
  expect(status).toMatchObject({ ready: true, degraded: false });
  expect(await shell.getEntityService().countEmbeddings()).toBeGreaterThan(0);

  const reply = await shell.getAgentService().chat("Hello", "local-chat", {
    interfaceType: "cli",
    userPermissionLevel: "admin",
  });
  expect(reply.text).toContain("Hello from the local runtime.");
  expect(outside).toEqual([]);
}, 30_000);
