import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { BrokerConnection } from "../../../src/lib/broker/client";
import { buildGitCredentialEnv } from "../../../src/lib/broker/git-credentials";
import { startGitBrokerHost } from "../../../src/lib/broker/host";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";
import type { GitBrokerServer } from "../../../src/lib/broker/server";
import {
  getGitRemoteFingerprint,
  resolveGitRemoteUrl,
  splitGitRemoteCredential,
} from "../../../src/lib/git-options";

/**
 * Safety invariant 6 covers every accepted configuration, not only the
 * separate token field.
 *
 * A `gitUrl` may legitimately arrive with credentials in its userinfo — that
 * is how the remote was configured before this plan — and writing it verbatim
 * to `origin` puts the token in `.git/config`, inside the checkout that is
 * then cloned, backed up and synced. An independent review reproduced exactly
 * that.
 */

const LINUX = process.platform === "linux";
const TOKEN = "ghp_configured0123456789";

let scratch: string | undefined;
let broker: GitBrokerServer | undefined;

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

afterEach(async () => {
  await broker?.stop();
  broker = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("a remote configured with embedded credentials", () => {
  it("separates the credential from the address", () => {
    const split = splitGitRemoteCredential(
      `https://x-access-token:${TOKEN}@github.com/rizom-ai/content.git`,
    );

    expect(split.remoteUrl).toBe("https://github.com/rizom-ai/content.git");
    expect(split.token).toBe(TOKEN);
  });

  it("leaves addresses that carry no credential alone", () => {
    for (const url of [
      "https://github.com/rizom-ai/content.git",
      "git@github.com:rizom-ai/content.git",
      "file:///srv/content.git",
    ]) {
      expect(splitGitRemoteCredential(url)).toEqual({
        remoteUrl: url,
        token: undefined,
      });
    }
  });

  it("never resolves to an address that still carries one", () => {
    // Everything downstream — fingerprint, clone, origin, logs — is derived
    // from this, so stripping here is what makes the rest safe by default.
    const resolved = resolveGitRemoteUrl({
      logger: createSilentLogger(),
      dataDir: "/brain/brain-data",
      gitUrl: `https://user:${TOKEN}@github.com/rizom-ai/content.git`,
    });

    expect(resolved).toBe("https://github.com/rizom-ai/content.git");
    expect(resolved).not.toContain(TOKEN);
  });

  it("fingerprints the same repository the same way either form", () => {
    expect(
      getGitRemoteFingerprint(
        `https://x-access-token:${TOKEN}@github.com/rizom-ai/content.git`,
      ),
    ).toBe(getGitRemoteFingerprint("https://github.com/rizom-ai/content.git"));
  });

  it("refuses inherited credential helpers", () => {
    // An ambient helper could answer for the broker from a store nobody here
    // controls, which is a credential this process never chose.
    const env = buildGitCredentialEnv(
      "https://github.com/rizom-ai/content.git",
      TOKEN,
    );
    const pairs = Number(env["GIT_CONFIG_COUNT"] ?? "0");
    const keys = Array.from(
      { length: pairs },
      (_, index) => env[`GIT_CONFIG_KEY_${index}`],
    );

    expect(keys).toContain("credential.helper");
    const helperIndex = keys.indexOf("credential.helper");
    expect(env[`GIT_CONFIG_VALUE_${helperIndex}`]).toBe("");
  });

  it.skipIf(!LINUX)(
    "keeps the credential out of the checkout it configures",
    async () => {
      scratch = await mkdtemp(join(tmpdir(), "configured-credential-"));
      const socketPath = gitBrokerSocketPath(join(scratch, "runtime"));
      const checkoutPath = join(scratch, "brain-data");
      // Refused immediately, so the clone falls back to a local init — the
      // path that still configures a remote.
      const address = "https://127.0.0.1:1/rizom-ai/content.git";
      const { logger, written } = recordingLogger();

      broker = await startGitBrokerHost({
        socketPath,
        cwd: scratch,
        dataDir: checkoutPath,
        logger,
        pluginConfig: {
          git: {
            gitUrl: `https://x-access-token:${TOKEN}@127.0.0.1:1/rizom-ai/content.git`,
            branch: "main",
          },
        },
      });

      const connection = await BrokerConnection.connect(socketPath);
      await connection.registerCheckout({
        checkoutPath,
        branch: "main",
        remoteFingerprint: getGitRemoteFingerprint(address),
      });
      await connection.execute(checkoutPath, { name: "initialize" });

      const config = await readFile(
        join(checkoutPath, ".git", "config"),
        "utf-8",
      );
      expect(config).toContain(address);
      expect(config).not.toContain(TOKEN);
      expect(written()).not.toContain(TOKEN);

      connection.close();
    },
    120_000,
  );
});
