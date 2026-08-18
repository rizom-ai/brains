import { afterEach, describe, expect, it } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import {
  GitBrokerServer,
  type GitBrokerJournal,
} from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

class FailingJournal implements GitBrokerJournal {
  readonly ambiguous = [];
  readonly evidenceComplete = true;
  readonly inheritedGeneration = false;
  readonly #failure: "start" | "settled";

  constructor(failure: "start" | "settled") {
    this.#failure = failure;
  }

  recordStart(): Promise<void> {
    return this.#failure === "start"
      ? Promise.reject(new Error("journal start write failed"))
      : Promise.resolve();
  }

  recordSettled(): Promise<void> {
    return this.#failure === "settled"
      ? Promise.reject(new Error("journal settled write failed"))
      : Promise.resolve();
  }
}

async function start(failure: "start" | "settled"): Promise<{
  checkout: string;
  connection: BrokerConnection;
}> {
  scratch = await mkdtemp(join(tmpdir(), "broker-journal-failure-"));
  const checkout = join(scratch, "checkout");
  const remoteFingerprint = getGitRemoteFingerprint("");
  broker = await GitBrokerServer.start({
    runtimeDir: join(scratch, "runtime"),
    journal: new FailingJournal(failure),
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
          }
        : undefined,
  });
  const connection = await BrokerConnection.connect(broker.socketPath);
  await connection.registerCheckout({
    checkoutPath: checkout,
    branch: "main",
    remoteFingerprint,
  });
  return { checkout, connection };
}

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("a broker journal write failure", () => {
  it("answers the caller and executes nothing when start is not durable", async () => {
    const { checkout, connection } = await start("start");

    const failure = await connection
      .executeWithId("req_journalstart1", checkout, { name: "initialize" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(failure).toContain("journal start write failed");
    expect(await pathExists(join(checkout, ".git"))).toBe(false);
    const status = await connection.status();
    expect(status.admitsMutations).toBe(false);
    expect(status.recoveryPending).toBe(true);
    connection.close();
  });

  it("answers ambiguously and closes admission when settlement is not durable", async () => {
    const { checkout, connection } = await start("settled");

    const failure = await connection
      .executeWithId("req_journalsettle", checkout, { name: "initialize" })
      .then(
        () => undefined,
        (error: unknown) => String(error),
      );

    expect(failure).toContain("journal settled write failed");
    expect(await pathExists(join(checkout, ".git"))).toBe(true);
    const status = await connection.status();
    expect(status.admitsMutations).toBe(false);
    expect(status.recoveryPending).toBe(true);
    connection.close();
  });
});
