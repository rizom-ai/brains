import { afterEach, describe, expect, it } from "bun:test";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { initializeGitRepository } from "../../src/lib/git-init";
import { hasGitHead } from "../../src/lib/git-state";
import { GitSync } from "../../src/lib/git-sync";
import type {
  GitRunnerFactory,
  GitRunnerRequest,
} from "../../src/lib/git-runner-factory";
import { createOwnedGitRunnerFactory } from "../../src/lib/git-runner-factory";
import type { GitCommandRunner } from "../../src/lib/owned-git";

/**
 * Phase 4 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Every Git path must resolve its runner from injected dependencies, because
 * Phase 5 swaps that runner for the broker-backed one. A path that constructs
 * its own runner would silently keep executing Git in the app process.
 */

let scratch: string | undefined;

interface Recorded {
  request: GitRunnerRequest;
  args: string[];
}

function recordingFactory(delegate: GitRunnerFactory): {
  factory: GitRunnerFactory;
  recorded: Recorded[];
} {
  const recorded: Recorded[] = [];
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
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("git runner factory seam", () => {
  it("has no runner construction outside the factory", async () => {
    const root = join(import.meta.dir, "../../src");
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) return walk(path);
          return entry.name.endsWith(".ts") ? [path] : [];
        }),
      );
      return nested.flat();
    };

    const files = await walk(root);
    const offenders = await Promise.all(
      files.map(async (file) => {
        const body = await readFile(file, "utf-8");
        return body.includes("new OwnedGitProcessRunner") ? file : null;
      }),
    );

    expect(
      offenders
        .filter((file): file is string => file !== null)
        .map((file) => file.slice(root.length + 1)),
    ).toEqual(["lib/git-runner-factory.ts"]);
  });

  it("routes bootstrap clone, init, and branch repair through the factory", async () => {
    scratch = await mkdtemp(join(tmpdir(), "runner-factory-"));
    const dataDir = join(scratch, "checkout");
    const { factory, recorded } = recordingFactory(
      createOwnedGitRunnerFactory(),
    );

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
    // Repository preparation is bootstrap work: the checkout does not exist
    // yet, so Phase 5 must send these under the bootstrap operation class.
    expect(
      recorded
        .filter((entry) => entry.args[0] === "init")
        .every((entry) => entry.request.bootstrap === true),
    ).toBe(true);
  }, 30_000);

  it("resolves the GitSync runner from the injected factory", async () => {
    scratch = await mkdtemp(join(tmpdir(), "runner-factory-sync-"));
    const { factory, recorded } = recordingFactory(
      createOwnedGitRunnerFactory(),
    );

    const gitSync = new GitSync({
      logger: createSilentLogger(),
      dataDir: scratch,
      runnerFactory: factory,
    });
    await gitSync.initialize();
    // Branch repair legitimately runs status during bootstrap, so only the
    // commands issued afterwards are ordinary work.
    recorded.length = 0;
    await gitSync.getStatus();

    expect(recorded.map((entry) => entry.args[0])).toContain("status");
    // The bootstrap client's life ends with bootstrap. Reusing it would send
    // every later command under the bootstrap class, which the broker refuses
    // once the checkout is real.
    expect(recorded.every((entry) => entry.request.bootstrap !== true)).toBe(
      true,
    );
  }, 30_000);

  it("resolves the head probe from the injected factory", async () => {
    scratch = await mkdtemp(join(tmpdir(), "runner-factory-head-"));
    const { factory, recorded } = recordingFactory(
      createOwnedGitRunnerFactory(),
    );

    await initializeGitRepository({
      logger: createSilentLogger(),
      dataDir: scratch,
      remoteUrl: "",
      authenticatedUrl: "",
      branch: "main",
      timeoutMs: 30_000,
      runnerFactory: factory,
    });
    recorded.length = 0;

    expect(await hasGitHead(scratch, factory)).toBe(true);
    expect(recorded.map((entry) => entry.args[0])).toEqual(["rev-parse"]);
  }, 30_000);
});
