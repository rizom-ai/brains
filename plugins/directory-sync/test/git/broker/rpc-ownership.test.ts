import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { deferred } from "@brains/utils/deferred";
import {
  BrokerConnection,
  BrokerUnavailableError,
} from "../../../src/lib/broker/client";
import { GitBrokerServer } from "../../../src/lib/broker/server";
import type { JournalStart } from "../../../src/lib/broker/journal";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";
import { commitTouching } from "../real-git";

// The adapter gate is after Git has exited but before the owned checkout turn
// settles. No elapsed-time inference or cancellation-aware mock is involved.
describe.skipIf(process.platform !== "linux")(
  "broker-owned work versus RPC observers",
  () => {
    it.each(["abort", "disconnect"] as const)(
      "keeps a mutation owned after observer %s and replays it once",
      async (mode) => {
        const root = await mkdtemp(join(tmpdir(), "rpc-operation-owner-"));
        const checkout = join(root, "checkout");
        const remoteFingerprint = getGitRemoteFingerprint("");
        const entered = deferred();
        const release = deferred();
        const queued = deferred();
        const journalStarts: JournalStart[] = [];
        const journalSettles: string[] = [];
        const operationId = "req_owner_commit";
        const queuedId = "req_owner_queued";
        const connections: BrokerConnection[] = [];
        const admitted: Promise<unknown>[] = [];
        let broker: GitBrokerServer | undefined;
        try {
          broker = await GitBrokerServer.start({
            runtimeDir: join(root, "runtime"),
            journal: {
              ambiguous: [],
              evidenceComplete: true,
              inheritedGeneration: false,
              recordStart: async (start): Promise<void> => {
                journalStarts.push(start);
                if (start.requestId === queuedId) queued.resolve();
              },
              recordSettled: async (id): Promise<void> => {
                journalSettles.push(id);
              },
            },
            resolveCheckout: (path) =>
              path === checkout
                ? {
                    logger: createSilentLogger(),
                    dataDir: checkout,
                    branch: "main",
                    remoteUrl: "",
                    remoteFingerprint,
                    timeoutMs: 30_000,
                    authorName: "Test",
                    authorEmail: "test@example.com",
                    afterOperation: async (operation): Promise<void> => {
                      if (operation.name !== "commit") return;
                      entered.resolve();
                      await release.promise;
                    },
                  }
                : undefined,
          });
          const connect = async (): Promise<BrokerConnection> => {
            if (!broker) throw new Error("Missing test broker");
            const connection = await BrokerConnection.connect(
              broker.socketPath,
            );
            connections.push(connection);
            await connection.registerCheckout({
              checkoutPath: checkout,
              branch: "main",
              remoteFingerprint,
            });
            return connection;
          };
          const observer = await connect();
          const independent = await connect();
          await observer.execute(checkout, { name: "initialize" });
          await writeFile(join(checkout, "first.md"), "first\n");
          const controller = new AbortController();
          const abandoned = observer
            .executeWithId(
              operationId,
              checkout,
              { name: "commit" },
              { signal: controller.signal },
            )
            .then(
              () => {
                throw new Error("Abandoned observer unexpectedly succeeded");
              },
              (error: unknown): unknown => error,
            );
          admitted.push(abandoned);
          await entered.promise;
          const reason = Object.freeze({ message: "caller stops observing" });
          if (mode === "abort") controller.abort(reason);
          else observer.close();
          const error = await abandoned;
          if (mode === "abort") {
            expect(error).toBe(reason);
            expect((await observer.status()).brokerId).toBe(broker.brokerId);
          } else expect(error).toBeInstanceOf(BrokerUnavailableError);

          const afterAbandon = await independent.status();
          expect(afterAbandon.activeRequestIds).toContain(operationId);
          expect(journalSettles).not.toContain(operationId);
          const following = independent.executeWithId(queuedId, checkout, {
            name: "get-status",
          });
          admitted.push(following);
          await queued.promise;
          const during = await independent.status();
          expect(during.activeRequestIds).toContain(operationId);
          expect(during.queuedRequestIds).toContain(queuedId);
          expect(during.activeRequestIds).not.toContain(queuedId);
          expect(journalSettles).not.toContain(queuedId);

          const replayObserver = await connect();
          const replay = replayObserver.executeWithId(operationId, checkout, {
            name: "commit",
          });
          admitted.push(replay);
          // This query is an explicit transport barrier after the replay request.
          await replayObserver.status();
          expect(
            journalStarts.filter((start) => start.requestId === operationId),
          ).toHaveLength(1);
          release.resolve();
          await Promise.all([following, replay]);
          expect(
            journalSettles.filter((id) => id === operationId),
          ).toHaveLength(1);
          expect((await independent.status()).activeRequestIds).not.toContain(
            operationId,
          );
          await writeFile(join(checkout, "second.md"), "second\n");
          await replayObserver.executeWithId(operationId, checkout, {
            name: "commit",
          });
          expect(await commitTouching(checkout, "first.md")).toEqual([
            "first.md",
          ]);
          expect(await commitTouching(checkout, "second.md")).toEqual([]);
        } finally {
          release.resolve();
          await Promise.allSettled(admitted);
          connections.forEach((connection) => connection.close());
          await broker?.stop();
          await rm(root, { recursive: true, force: true });
        }
      },
      60_000,
    );
  },
);
