import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { buildGitCredentialEnv } from "../../../src/lib/broker/git-credentials";
import { runGitCommandWithStallTimeout } from "../../../src/lib/broker/git-stall";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import { BrokerConnection } from "../../../src/lib/broker/client";

/**
 * Phase 4 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Invariant 6 is about where a token is *not*. These drive real Git with a
 * real token and then go looking for it.
 */

const LINUX = process.platform === "linux";
const TOKEN = "ghp_leakcanary0123456789";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("credential handling", () => {
  it("is read by git from the environment", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-credential-env-"));
    const remoteUrl = "https://github.com/rizom-ai/content.git";

    // Asking Git itself what it sees proves the mechanism rather than the
    // shape of the variables: config supplied this way is config.
    const seen = await runGitCommandWithStallTimeout(
      {
        baseDir: scratch,
        timeoutMs: 30_000,
        credentialEnv: buildGitCredentialEnv(remoteUrl, TOKEN),
      },
      ["config", "--get", `http.${remoteUrl}.extraheader`],
    );

    expect(seen.trim()).toBe(
      `Authorization: Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`,
    );
  }, 30_000);

  it("leaves no token in the checkout after a private remote fails", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-credential-leak-"));
    const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
    const checkoutPath = join(scratch, "brain-data");
    // Refused immediately rather than left to time out, so the clone attempt
    // fails and the checkout is initialized locally — the path where a remote
    // still gets configured, which is where the credential used to be written.
    const remoteUrl = "https://127.0.0.1:1/rizom-ai/content.git";

    broker = await startGitBrokerHost({
      socketPath,
      cwd: scratch,
      dataDir: checkoutPath,
      logger: createSilentLogger(),
      pluginConfig: {
        git: { gitUrl: remoteUrl, branch: "main", authToken: TOKEN },
      },
    });

    const connection = await BrokerConnection.connect(socketPath);
    await connection.registerCheckout({
      checkoutPath,
      branch: "main",
      remoteFingerprint: (
        await import("../../../src/lib/git-options")
      ).getGitRemoteFingerprint(remoteUrl),
    });
    await connection.execute(checkoutPath, { name: "initialize" });

    const config = await readFile(
      join(checkoutPath, ".git", "config"),
      "utf-8",
    );
    expect(config).toContain(remoteUrl);
    expect(config).not.toContain(TOKEN);

    connection.close();
  }, 120_000);
});
