import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import { getGitRemoteFingerprint } from "../../../src/lib/git-options";

/**
 * Identity is physical, not lexical.
 *
 * Two spellings of one directory are one checkout. If the owner matches on the
 * string it was given, a role reaching it through a symlink is refused — or
 * worse, a second endpoint is derived for a repository that already has an
 * owner, which is two owners for one working tree.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("checkout identity", () => {
  it("recognises the same checkout through a symlink", async () => {
    scratch = await mkdtemp(join(tmpdir(), "checkout-identity-"));
    const real = join(scratch, "brain-data");
    const alias = join(scratch, "alias");
    await mkdir(real, { recursive: true });
    await symlink(real, alias);

    broker = await startGitBrokerHost({
      socketPath: gitBrokerSocketPath(join(scratch, "runtime")),
      cwd: scratch,
      dataDir: real,
      logger: createSilentLogger(),
      pluginConfig: { git: { gitUrl: "file:///srv/content.git" } },
    });

    const connection = await BrokerConnection.connect(broker.socketPath);
    const identity = {
      branch: "main",
      remoteFingerprint: getGitRemoteFingerprint("file:///srv/content.git"),
    };

    // The same working tree, spelled the other way. Refusing it would leave a
    // role unable to reach an owner that is already managing its checkout.
    const status = await connection.registerCheckout({
      checkoutPath: alias,
      ...identity,
    });
    expect(status.checkouts).toHaveLength(1);

    // And it is one registration, not two owners of one directory.
    await connection.registerCheckout({ checkoutPath: real, ...identity });
    expect((await connection.status()).checkouts).toHaveLength(1);

    connection.close();
  }, 60_000);
});
