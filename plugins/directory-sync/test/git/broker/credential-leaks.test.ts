import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { buildGitCredentialEnv } from "../../../src/lib/broker/git-credentials";
import { runGitCommandWithStallTimeout } from "../../../src/lib/broker/git-stall";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import { BrokerConnection } from "../../../src/lib/broker/client";

/**
 * Invariant 6 is about where a token is *not*. These drive real Git with a
 * real token and then go looking for it.
 */

const LINUX = process.platform === "linux";
const TOKEN = "ghp_leakcanary0123456789";
const ENCODED = Buffer.from("x-access-token:" + TOKEN).toString("base64");

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

/** A logger that keeps everything, so the sweep has something to search. */
function recordingLogger(): { logger: Logger; written: () => string } {
  const lines: string[] = [];
  const record =
    (level: string) =>
    (message: string, context?: unknown): void => {
      lines.push([level, message, JSON.stringify(context ?? null)].join(" "));
    };
  const logger: Logger = Object.assign(Object.create(createSilentLogger()), {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    child: (): Logger => logger,
  });
  return { logger, written: (): string => lines.join("\n") };
}

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

  it("keeps the token out of what a failure reports", async () => {
    scratch = await mkdtemp(join(tmpdir(), "git-credential-report-"));
    const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
    const checkoutPath = join(scratch, "brain-data");
    const remoteUrl = "https://127.0.0.1:1/rizom-ai/content.git";
    const { logger, written } = recordingLogger();

    broker = await startGitBrokerHost({
      socketPath,
      cwd: scratch,
      dataDir: checkoutPath,
      logger,
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

    // A push to an unreachable remote is the realistic way a credential
    // surfaces: in the message Git prints, and in the message we relay on.
    const failure = await connection
      .execute(checkoutPath, { name: "push" })
      .then(
        () => "",
        (error: unknown) => String(error),
      );

    // Base64 is an encoding, not a secret, so the encoded header is searched
    // for too: leaking it is leaking the token.
    for (const secret of [TOKEN, ENCODED]) {
      expect(failure).not.toContain(secret);
      expect(written()).not.toContain(secret);
    }
    // The sweep only means something if there was output to sweep.
    expect(written().length).toBeGreaterThan(0);

    connection.close();
  }, 120_000);
});
