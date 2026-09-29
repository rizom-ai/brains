import { describe, expect, it } from "bun:test";
import { deferred } from "@brains/utils/deferred";
import { createSilentLogger } from "@brains/test-utils";
import type { RegisteredHttpRoute } from "@brains/plugins/internal/http-routes";
import {
  ServerManager,
  type RunningServer,
  type ServeFn,
} from "../src/server-manager";

describe("HTTP host shutdown ownership", () => {
  it("joins admitted handlers even after sockets close and rejects new admission", async () => {
    const entered = deferred();
    const finish = deferred();
    let fetchRequest: Parameters<ServeFn>[0]["fetch"] | undefined;
    let signal: AbortSignal | undefined;
    const manager = new ServerManager({
      logger: createSilentLogger(),
      productionPort: 0,
      productionDistDir: "/unused",
      sharedImagesDir: "/unused",
      serve: (options): RunningServer => {
        fetchRequest = options.fetch;
        return { port: 0, stop: (): void => {} };
      },
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        {
          kind: "handler",
          ownerPluginId: "test",
          method: "GET",
          fullPath: "/test",
          match: "exact",
          sharedHostAdmission: "admit",
          handler: async (request): Promise<Response> => {
            signal = request.signal;
            entered.resolve();
            await finish.promise;
            return new Response("finished");
          },
        },
      ],
    });
    await manager.start();
    if (!fetchRequest) throw new Error("No listener");
    const request = fetchRequest(new Request("http://localhost/test"));
    await entered.promise;
    let stopped = false;
    const stopping = manager.stop().then(() => {
      stopped = true;
    });
    try {
      const rejected = await fetchRequest(new Request("http://localhost/test"));
      expect(rejected.status).toBe(503);
      expect(stopped).toBe(false);
    } finally {
      finish.resolve();
      await stopping;
    }
    expect(signal?.aborted).toBe(true);
    expect(await (await request).text()).toBe("finished");
    expect(stopped).toBe(true);
  });

  it("cancels a streaming response after the shutdown grace period", async () => {
    const cancelled = deferred();
    const manager = new ServerManager({
      logger: createSilentLogger(),
      productionPort: 0,
      shutdownGracePeriodMs: 10,
      productionDistDir: "/unused",
      sharedImagesDir: "/unused",
      getRoutes: (): readonly RegisteredHttpRoute[] => [
        {
          kind: "handler",
          ownerPluginId: "test",
          method: "GET",
          fullPath: "/stream",
          match: "exact",
          sharedHostAdmission: "admit",
          handler: (request): Response =>
            new Response(
              new ReadableStream({
                start(controller): void {
                  controller.enqueue(new TextEncoder().encode("hello"));
                  request.signal.addEventListener(
                    "abort",
                    () => {
                      cancelled.resolve();
                      controller.close();
                    },
                    { once: true },
                  );
                },
              }),
            ),
        },
      ],
    });
    await manager.start();
    const response = await fetch(`${manager.getStatus().productionUrl}/stream`);
    expect(response.status).toBe(200);
    await manager.stop();
    await cancelled.promise;
    expect(manager.getStatus().running).toBe(false);
  });
});
