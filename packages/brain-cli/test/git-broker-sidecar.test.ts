import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GIT_BROKER_CHECKOUT_ENV,
  GIT_BROKER_SOCKET_ENV,
} from "@brains/directory-sync";
import { withGitBrokerSidecar } from "../src/lib/git-broker-sidecar";

/**
 * Review blocker 7.
 *
 * Only the ordinary supervised start reached `superviseRuntimeChildren`, so
 * monorepo development, `--chat` and `--startup-check` booted a Git-configured
 * Brain with no owner at all. The plugin then failed during registration for
 * want of a socket — a real Brain that simply does not start, discovered by
 * whoever runs it rather than by a test.
 */

let scratch: string | undefined;

const GIT_CONFIGURED = {
  brain: "brain",
  plugins: {
    "directory-sync": {
      git: { repo: "rizom-ai/content", branch: "main" },
    },
  },
};

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("a git-configured brain outside the supervisor", () => {
  it("hands the owner and its absolute checkout to the app role", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-"));
    const seen: Array<{
      socket: string | undefined;
      checkout: string | undefined;
    }> = [];

    const result = await withGitBrokerSidecar(scratch, GIT_CONFIGURED, () => {
      seen.push({
        socket: process.env[GIT_BROKER_SOCKET_ENV],
        checkout: process.env[GIT_BROKER_CHECKOUT_ENV],
      });
      return Promise.resolve("booted");
    });

    expect(result).toBe("booted");
    expect(seen[0]?.socket).toContain("git-broker.sock");
    expect(seen[0]?.checkout).toBe(join(scratch, "brain-data"));
    // The variables belong to the run, not to the process that hosted it.
    expect(process.env[GIT_BROKER_SOCKET_ENV]).toBeUndefined();
    expect(process.env[GIT_BROKER_CHECKOUT_ENV]).toBeUndefined();
  }, 60_000);

  it("starts nothing for a brain without git", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-none-"));
    const seen: Array<string | undefined> = [];

    await withGitBrokerSidecar(scratch, { brain: "brain" }, () => {
      seen.push(process.env[GIT_BROKER_SOCKET_ENV]);
      return Promise.resolve(undefined);
    });

    // A Brain without Git acquires no owner and no Git dependency, here as
    // anywhere else.
    expect(seen).toEqual([undefined]);
  }, 60_000);

  it("stops the owner even when the boot fails", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-sidecar-fail-"));

    const outcome = await withGitBrokerSidecar(scratch, GIT_CONFIGURED, () =>
      Promise.reject(new Error("boot failed")),
    ).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("boot failed");
    // A leaked owner would hold the socket against the next run.
    expect(process.env[GIT_BROKER_SOCKET_ENV]).toBeUndefined();
  }, 60_000);
});
