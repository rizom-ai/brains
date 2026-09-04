import { z } from "@brains/utils/zod";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, access, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createConnection } from "node:net";
import {
  LOCAL_DATABASE_PROTOCOL_VERSION,
  LocalDatabaseFrameDecoder,
  LocalDatabaseRpcClient,
  type LocalDatabaseOperationScope,
  LocalDatabaseRpcServer,
} from "../src/local-database-endpoint";
import type { LocalDatabaseEndpointConfig } from "../src/runtime-process-role";

interface Harness {
  dir: string;
  server: LocalDatabaseRpcServer;
  client: LocalDatabaseRpcClient;
  serverConfig: LocalDatabaseEndpointConfig;
  clientConfig: LocalDatabaseEndpointConfig;
}

const harnesses: Harness[] = [];

function captureRejection(promise: Promise<unknown>): Promise<Error> {
  return promise.then<never, Error>(
    () => {
      throw new Error("Expected promise to reject");
    },
    (error: unknown) =>
      error instanceof Error ? error : new Error(String(error)),
  );
}

function encodeTestFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  const frame = Buffer.alloc(body.length + 4);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

async function createHarness(options?: {
  clientSecret?: string;
  serverMaxInFlight?: number;
  serverMaxFrameBytes?: number;
  clientMaxInFlight?: number;
  clientMaxFrameBytes?: number;
  clientRequestTimeoutMs?: number;
  withOperationScope?: boolean;
}): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "brains-local-db-"));
  const address = join(dir, "owner.sock");
  const serverConfig = {
    address,
    secret: "s".repeat(48),
    sessionId: "web-session",
  };
  const clientConfig = {
    address,
    secret: options?.clientSecret ?? serverConfig.secret,
    sessionId: "worker-session",
  };
  const server = new LocalDatabaseRpcServer({
    config: serverConfig,
    ...(options?.serverMaxInFlight !== undefined && {
      maxInFlight: options.serverMaxInFlight,
    }),
    ...(options?.serverMaxFrameBytes !== undefined && {
      maxFrameBytes: options.serverMaxFrameBytes,
    }),
  });
  const client = new LocalDatabaseRpcClient({
    config: clientConfig,
    ...(options?.clientMaxInFlight !== undefined && {
      maxInFlight: options.clientMaxInFlight,
    }),
    ...(options?.clientMaxFrameBytes !== undefined && {
      maxFrameBytes: options.clientMaxFrameBytes,
    }),
    ...(options?.clientRequestTimeoutMs !== undefined && {
      requestTimeoutMs: options.clientRequestTimeoutMs,
    }),
    ...(options?.withOperationScope && {
      getOperationScope: (): LocalDatabaseOperationScope => ({
        provenance: {
          rootJobId: "root-job",
          causationId: "cause-1",
          projectionLineage: [],
          derivationDepth: 0,
        },
        operationId: "operation-1",
      }),
    }),
  });
  const harness = { dir, server, client, serverConfig, clientConfig };
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.server.close();
    harness.client.close();
    await rm(harness.dir, { recursive: true, force: true });
  }
});

describe("private local database endpoint", () => {
  it("decodes fragmented and coalesced length-prefixed frames", () => {
    const decoder = new LocalDatabaseFrameDecoder(1_024);
    const first = encodeTestFrame({
      kind: "cancel",
      requestId: "request-1",
    });
    const second = encodeTestFrame({
      kind: "cancel",
      requestId: "request-2",
    });

    expect(decoder.push(first.subarray(0, 2))).toEqual([]);
    expect(decoder.push(first.subarray(2, 7))).toEqual([]);
    expect(decoder.push(Buffer.concat([first.subarray(7), second]))).toEqual([
      { kind: "cancel", requestId: "request-1" },
      { kind: "cancel", requestId: "request-2" },
    ]);
  });

  it("round-trips the explicit typed-array wire representation", async () => {
    const harness = await createHarness();
    harness.server.register("echo", async (payload) => payload);
    await harness.server.initialize();
    await harness.client.initialize();

    const result = z
      .object({
        bytes: z.instanceof(Uint8Array),
        embedding: z.instanceof(Float32Array),
      })
      .parse(
        await harness.client.request("echo", {
          bytes: new Uint8Array([1, 2, 255]),
          embedding: new Float32Array([0.25, -1.5]),
        }),
      );

    expect([...result.bytes]).toEqual([1, 2, 255]);
    expect([...result.embedding]).toEqual([0.25, -1.5]);
  });

  it("rejects class instances instead of degrading them to JSON", async () => {
    const harness = await createHarness();
    harness.server.register("echo", async (payload) => payload);
    await harness.server.initialize();
    await harness.client.initialize();

    expect(
      await captureRejection(
        harness.client.request("echo", { value: new Date() }),
      ),
    ).toMatchObject({ code: "LOCAL_DATABASE_UNSUPPORTED_VALUE" });
  });

  it("authenticates a worker and carries validated request context", async () => {
    const harness = await createHarness({ withOperationScope: true });
    let observedSession: string | undefined;
    harness.server.register("test", async (payload, context) => {
      observedSession = context.sessionId;
      return { payload, scope: context.scope };
    });
    await harness.server.initialize();
    await harness.client.initialize();

    expect(await harness.client.request("test", { value: 42 })).toEqual({
      payload: { value: 42 },
      scope: {
        provenance: {
          rootJobId: "root-job",
          causationId: "cause-1",
          projectionLineage: [],
          derivationDepth: 0,
        },
        operationId: "operation-1",
      },
    });
    expect(observedSession).toBe("worker-session");
  });

  it("rejects a client with the wrong capability secret", async () => {
    const harness = await createHarness({ clientSecret: "x".repeat(48) });
    await harness.server.initialize();

    expect(
      (await captureRejection(harness.client.initialize())).message,
    ).toMatch(/handshake|endpoint closed/i);
  });

  it("rejects unsupported protocol versions before dispatch", async () => {
    const harness = await createHarness();
    await harness.server.initialize();
    const socket = createConnection(harness.serverConfig.address);
    socket.on("error", () => undefined);
    await once(socket, "connect");

    socket.write(
      encodeTestFrame({
        kind: "handshake",
        version: LOCAL_DATABASE_PROTOCOL_VERSION + 1,
        secret: harness.serverConfig.secret,
        sessionId: "unsupported-client",
      }),
    );

    await once(socket, "close");
  });

  it("propagates cancellation to an admitted owner request", async () => {
    const harness = await createHarness();
    let admitted = (): void => {};
    const admittedPromise = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    let acknowledgeOwnerAbort = (): void => {};
    const ownerAborted = new Promise<void>((resolve) => {
      acknowledgeOwnerAbort = resolve;
    });
    harness.server.register("wait", async (_payload, context) => {
      admitted();
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener(
          "abort",
          () => {
            acknowledgeOwnerAbort();
            reject(context.signal.reason);
          },
          { once: true },
        );
      });
    });
    await harness.server.initialize();
    await harness.client.initialize();

    const controller = new AbortController();
    const request = harness.client.request(
      "wait",
      {},
      { signal: controller.signal },
    );
    await admittedPromise;
    controller.abort(new Error("test cancellation"));

    expect((await captureRejection(request)).message).toBe("test cancellation");
    await ownerAborted;
  });

  it("bounds admitted requests before dispatch", async () => {
    const harness = await createHarness({
      serverMaxInFlight: 1,
      clientMaxInFlight: 2,
    });
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let admitted = (): void => {};
    const admittedPromise = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    harness.server.register("bounded", async () => {
      admitted();
      await gate;
      return true;
    });
    await harness.server.initialize();
    await harness.client.initialize();

    const first = harness.client.request("bounded", {});
    await admittedPromise;
    expect(
      await captureRejection(harness.client.request("bounded", {})),
    ).toMatchObject({
      code: "LOCAL_DATABASE_OVERLOADED",
    });
    release();
    expect(await first).toBe(true);
  });

  it("rejects oversized frames before writing them", async () => {
    const harness = await createHarness({ clientMaxFrameBytes: 256 });
    harness.server.register("echo", async (payload) => payload);
    await harness.server.initialize();
    await harness.client.initialize();

    expect(
      await captureRejection(
        harness.client.request("echo", { content: "x".repeat(512) }),
      ),
    ).toMatchObject({ code: "LOCAL_DATABASE_FRAME_SIZE" });
  });

  it("rejects only an oversized handler result and keeps the session usable", async () => {
    const harness = await createHarness({
      serverMaxFrameBytes: 512,
      clientMaxFrameBytes: 512,
    });
    harness.server.register("result", async (payload) =>
      payload === "large" ? { content: "x".repeat(1_024) } : "next",
    );
    await harness.server.initialize();
    await harness.client.initialize();

    expect(
      await captureRejection(harness.client.request("result", "large")),
    ).toMatchObject({ code: "LOCAL_DATABASE_FRAME_SIZE" });
    expect(await harness.client.request("result", "small")).toBe("next");
  });

  it("bounds pending work by its request deadline", async () => {
    const harness = await createHarness({ clientRequestTimeoutMs: 25 });
    let acknowledgeAdmission = (): void => undefined;
    const admitted = new Promise<void>((resolve) => {
      acknowledgeAdmission = resolve;
    });
    harness.server.register("wait", async (_payload, context) => {
      acknowledgeAdmission();
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener(
          "abort",
          () => reject(context.signal.reason),
          { once: true },
        );
      });
    });
    await harness.server.initialize();
    await harness.client.initialize();

    const pending = harness.client.request("wait", {});
    await admitted;
    expect(await captureRejection(pending)).toMatchObject({
      code: "LOCAL_DATABASE_REQUEST_TIMEOUT",
    });
  });

  it("does not deliver an old session reply to a restarted client", async () => {
    const harness = await createHarness();
    let releaseOldRequest = (): void => {};
    const oldRequestGate = new Promise<void>((resolve) => {
      releaseOldRequest = resolve;
    });
    let acknowledgeOldRequest = (): void => {};
    const oldRequestAdmitted = new Promise<void>((resolve) => {
      acknowledgeOldRequest = resolve;
    });
    harness.server.register("session", async (payload) => {
      if (payload === "old") {
        acknowledgeOldRequest();
        await oldRequestGate;
      }
      return payload;
    });
    await harness.server.initialize();
    await harness.client.initialize();

    const oldResult = harness.client
      .request("session", "old")
      .catch((error: unknown) => error);
    await oldRequestAdmitted;
    harness.client.close();
    expect(await oldResult).toBeInstanceOf(Error);

    const restartedClient = new LocalDatabaseRpcClient({
      config: {
        ...harness.clientConfig,
        sessionId: "worker-session-restarted",
      },
    });
    try {
      await restartedClient.initialize();
      expect(await restartedClient.request("session", "new")).toBe("new");
      releaseOldRequest();
    } finally {
      restartedClient.close();
    }
  });

  it("removes the private socket when the owner closes", async () => {
    const harness = await createHarness();
    await harness.server.initialize();
    await access(harness.serverConfig.address);
    expect((await stat(harness.serverConfig.address)).mode & 0o777).toBe(0o600);

    await harness.server.close();
    expect(
      await captureRejection(access(harness.serverConfig.address)),
    ).toMatchObject({ code: "ENOENT" });
  });
});
