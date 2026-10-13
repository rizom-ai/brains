import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Result } from "@brains/utils/effect";
import { BunSocket, BunSocketServer } from "@brains/utils/effect/bun";
import {
  RpcClient,
  RpcSerialization,
  RpcServer,
  Stream,
} from "@brains/utils/effect/rpc";
import { BrokerRpcs } from "../../../src/lib/broker/rpc-contract";
import type {
  BrokerRpcEvent,
  BrokerRpcFailure,
  BrokerRpcStatus,
} from "../../../src/lib/broker/rpc-contract";
import { makeBrokerRpcSerialization } from "../../../src/lib/broker/rpc-serialization";

const status: BrokerRpcStatus = {
  brokerId: "rpc-probe",
  checkouts: ["/checkout"],
  activeRequestIds: [],
  queuedRequestIds: [],
  ambiguousRequestIds: [],
  evidenceComplete: true,
  recoveryPending: false,
  admitsMutations: true,
  oldestActiveProgressAt: null,
};
const failure: BrokerRpcFailure = {
  _tag: "BrokerError",
  message: "probe failure",
};
const events: BrokerRpcEvent[] = [
  {
    _tag: "Progress",
    phase: "running",
    observedAt: "2026-01-01T00:00:00.000Z",
  },
  { _tag: "Result", outcome: "ok", value: null, error: null },
];

describe.skipIf(process.platform !== "linux")(
  "broker RPC over Bun Unix socket layers",
  () => {
    it("carries status, streaming progress/terminal results, and typed failures", async () => {
      const root = await mkdtemp(join(tmpdir(), "broker-rpc-probe-"));
      const path = join(root, "rpc.sock");
      const serialization = Layer.succeed(
        RpcSerialization.RpcSerialization,
        makeBrokerRpcSerialization(),
      );
      const handlers = BrokerRpcs.toLayer({
        RegisterCheckout: () => Effect.succeed(status),
        QueryStatus: () => Effect.succeed(status),
        OpenAdmission: () => Effect.fail(failure),
        ExecuteOperation: () => Stream.fromArray(events),
      });
      const server = RpcServer.layer(BrokerRpcs, { disableTracing: true }).pipe(
        Layer.provide(handlers),
        Layer.provide(
          RpcServer.layerProtocolSocketServer.pipe(
            Layer.provide(BunSocketServer.layer({ path })),
            Layer.provide(serialization),
          ),
        ),
      );
      const clientProtocol = RpcClient.layerProtocolSocket().pipe(
        Layer.provide(BunSocket.layerNet({ path })),
        Layer.provide(serialization),
      );
      try {
        await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              yield* Layer.build(server);
              const clientServices = yield* Layer.build(clientProtocol);
              const client = yield* RpcClient.make(BrokerRpcs, {
                disableTracing: true,
              }).pipe(
                Effect.provideService(
                  RpcClient.Protocol,
                  Context.get(clientServices, RpcClient.Protocol),
                ),
              );
              expect(
                yield* client.RegisterCheckout({
                  checkoutPath: "/checkout",
                  branch: "main",
                  remoteFingerprint: "local",
                }),
              ).toEqual(status);
              expect(yield* client.QueryStatus({})).toEqual(status);
              expect(
                yield* Stream.runCollect(
                  client.ExecuteOperation({
                    operationId: "req_socket_probe",
                    checkoutPath: "/checkout",
                    operation: { name: "get-status" },
                  }),
                ),
              ).toEqual(events);
              const failed = yield* client
                .OpenAdmission({})
                .pipe(Effect.result);
              expect(Result.isFailure(failed)).toBe(true);
              if (Result.isFailure(failed))
                expect(failed.failure).toEqual(failure);
            }),
          ),
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  },
);
