import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import { stopHostedBroker } from "../../src/lib/broker/hosted";
import { createBrokerGitRunnerFactory } from "../../src/lib/broker-runner-factory";
import { initializeGitRepository } from "../../src/lib/git-init";
import { GitSync } from "../../src/lib/git-sync";
import type {
  GitRunnerFactory,
  GitRunnerRequest,
} from "../../src/lib/git-runner-factory";
import type { GitCommandRunner } from "../../src/lib/owned-git";

/**
 * Phase 4 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Every Git path resolves its runner from injected dependencies, so the
 * execution boundary is replaceable and every command is observable. The
 * delegate here is the real broker-backed factory — there is no in-process
 * runner to substitute.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

interface Recorded {
  request: GitRunnerRequest;
  args: string[];
}

function recordingFactory(checkoutPath: string): {
  factory: GitRunnerFactory;
  recorded: Recorded[];
} {
  const recorded: Recorded[] = [];
  const delegate = createBrokerGitRunnerFactory({
    repositoryKey: sha256Hex(checkoutPath).slice(0, 32),
    checkoutPath,
    branch: "main",
    remoteFingerprint: sha256Hex(""),
    timeoutMs: 30_000,
  });

  const factory: GitRunnerFactory = (request): GitCommandRunner => {
    const runner = delegate(request);
    return {
      run: (args, options): Promise<string> => {
        recorded.push({ request, args: [...args] });
        return runner.run(args, options);
      },
    };
  };
  return { factory, recorded };
}

afterEach(async () => {
  await stopHostedBroker();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("git runner factory seam", () => {
  it("routes repository preparation through the factory", async () => {
    scratch = await mkdtemp(join(tmpdir(), "runner-factory-"));
    const dataDir = join(scratch, "checkout");
    const { factory, recorded } = recordingFactory(dataDir);

    await initializeGitRepository({
      logger: createSilentLogger(),
      dataDir,
      remoteUrl: "",
      authenticatedUrl: "",
      branch: "main",
      timeoutMs: 30_000,
      runnerFactory: factory,
      authorName: "Test",
      authorEmail: "test@example.com",
    });

    const subcommands = recorded.map((entry) => entry.args[0]);
    // Nothing reaches Git without passing through the injected factory.
    expect(subcommands).toContain("init");
    expect(subcommands).toContain("config");
    expect(subcommands).toContain("checkout");
    // `init` runs before the checkout exists, so it is bootstrap work. The
    // commands that follow run against a real repository and are not.
    expect(
      recorded
        .filter((entry) => entry.args[0] === "init")
        .every((entry) => entry.request.bootstrap === true),
    ).toBe(true);
    expect(
      recorded
        .filter((entry) => entry.args[0] === "checkout")
        .every((entry) => entry.request.bootstrap !== true),
    ).toBe(true);
  }, 60_000);

  it("resolves the GitSync runner from the injected factory", async () => {
    scratch = await mkdtemp(join(tmpdir(), "runner-factory-sync-"));
    const dataDir = join(scratch, "checkout");
    const { factory, recorded } = recordingFactory(dataDir);

    const gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir,
      runnerFactory: factory,
    });
    await gitSync.initialize();
    recorded.length = 0;
    await gitSync.getStatus();

    expect(recorded.map((entry) => entry.args[0])).toContain("status");
    // The bootstrap client's life ends with bootstrap. Reusing it would send
    // every later command under the bootstrap class, which the broker refuses
    // once the checkout is real.
    expect(recorded.every((entry) => entry.request.bootstrap !== true)).toBe(
      true,
    );

    await gitSync.cleanup();
  }, 60_000);
});
