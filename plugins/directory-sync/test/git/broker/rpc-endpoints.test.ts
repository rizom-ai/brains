import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deferred } from "@brains/utils/deferred";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import {
  BROKER_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
} from "../../../src/lib/broker/protocol";

function frame(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  );
  const bytes = new Uint8Array(body.length + 4);
  new DataView(bytes.buffer).setUint32(0, body.length, false);
  bytes.set(body, 4);
  return bytes;
}

describe.skipIf(process.platform !== "linux")(
  "production broker RPC transport",
  () => {
    it("publishes only one of two concurrent socket owners", async () => {
      const root = await mkdtemp(join(tmpdir(), "rpc-socket-publication-"));
      const started = await Promise.allSettled(
        Array.from({ length: 2 }, () =>
          GitBrokerServer.start({
            runtimeDir: root,
            resolveCheckout: () => undefined,
          }),
        ),
      );
      const owners = started.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.value] : [],
      );
      let client: BrokerConnection | undefined;
      try {
        expect(owners).toHaveLength(1);
        const owner = owners[0];
        if (!owner) throw new Error("No socket owner published");
        client = await BrokerConnection.connect(owner.socketPath);
        expect((await client.status()).brokerId).toBe(owner.brokerId);
      } finally {
        client?.close();
        await Promise.all(owners.map((owner) => owner.stop()));
        expect(
          (await readdir(root)).filter((name) => name.startsWith(".g")),
        ).toEqual([]);
        await rm(root, { recursive: true, force: true });
      }
    });

    it("does not unlink a replacement socket when the old owner stops", async () => {
      const root = await mkdtemp(join(tmpdir(), "rpc-owned-socket-"));
      let broker: GitBrokerServer | undefined;
      let replacement: ReturnType<typeof Bun.listen> | undefined;
      try {
        broker = await GitBrokerServer.start({
          runtimeDir: root,
          resolveCheckout: () => undefined,
        });
        const socketPath = broker.socketPath;
        await unlink(socketPath);
        replacement = Bun.listen({
          unix: socketPath,
          socket: { data: (): void => {} },
        });
        const identity = await stat(socketPath);
        await broker.stop();
        expect((await stat(socketPath)).ino).toBe(identity.ino);
        const probe = await Bun.connect({
          unix: socketPath,
          socket: { data: (): void => {} },
        });
        probe.end();
      } finally {
        replacement?.stop(true);
        await broker?.stop();
        await rm(root, { recursive: true, force: true });
      }
    });

    it.each([
      ["malformed JSON", frame("{bad")],
      [
        "invalid RPC payload",
        frame({
          version: BROKER_PROTOCOL_VERSION,
          message: {
            _tag: "Request",
            id: 1,
            tag: "QueryStatus",
            payload: { extra: true },
            headers: [],
          },
        }),
      ],
      [
        "version mismatch",
        frame({
          version: BROKER_PROTOCOL_VERSION + 1,
          message: { _tag: "Ping" },
        }),
      ],
      [
        "oversized declaration",
        ((): Uint8Array => {
          const header = new Uint8Array(4);
          new DataView(header.buffer).setUint32(0, MAX_FRAME_BYTES + 1, false);
          return header;
        })(),
      ],
    ])(
      "closes a peer sending %s without affecting independent status",
      async (_label: string, bytes: Uint8Array) => {
        const root = await mkdtemp(join(tmpdir(), "rpc-endpoint-"));
        let broker: GitBrokerServer | undefined;
        let connection: BrokerConnection | undefined;
        let peer: { end(): void } | undefined;
        try {
          broker = await GitBrokerServer.start({
            runtimeDir: join(root, "runtime"),
            resolveCheckout: () => undefined,
          });
          connection = await BrokerConnection.connect(broker.socketPath);
          const closed = deferred();
          const socket = await Bun.connect({
            unix: broker.socketPath,
            socket: {
              data: (): void => {},
              close: (): void => closed.resolve(),
              error: (): void => {},
            },
          });
          peer = socket;
          socket.write(bytes);
          await closed.promise;
          expect((await connection.status()).brokerId).toBe(broker.brokerId);
          expect((await stat(join(root, "runtime"))).mode & 0o777).toBe(0o700);
          expect((await stat(broker.socketPath)).mode & 0o777).toBe(0o600);
        } finally {
          peer?.end();
          connection?.close();
          await broker?.stop();
          await rm(root, { recursive: true, force: true });
        }
      },
      5000,
    );
  },
);
