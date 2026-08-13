import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import {
  liveEvidenceEnabled,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  PACKED_BRAIN_TARBALL_ENV,
  registryEvidenceEnabled,
  removeSpawnTempRoot,
  runCommand,
  startCommand,
  waitForHttpReadiness,
} from "./helpers/packed-consumer";

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    return getErrorMessage(error);
  }
}

describe("packed consumer harness", () => {
  it("captures bounded command diagnostics", async () => {
    const failure = await rejectionMessage(
      runCommand(
        [
          "bun",
          "-e",
          'console.log("packed stdout"); console.error("packed stderr"); process.exit(7)',
        ],
        import.meta.dir,
      ),
    );
    expect(failure).toMatch(/packed stdout[\s\S]*packed stderr/u);

    const timeout = await rejectionMessage(
      runCommand(
        ["bun", "-e", "setInterval(() => undefined, 1000)"],
        import.meta.dir,
        { timeoutMs: 50 },
      ),
    );
    expect(timeout).toContain("Command timed out");
  });

  it("waits for an emitted process-readiness signal", async () => {
    const started = startCommand(
      ["bun", "-e", 'setTimeout(() => console.log("worker-ready"), 10)'],
      import.meta.dir,
    );

    await started.waitForOutput("worker-ready", 1_000);
    expect(started.getOutput().stdout).toContain("worker-ready");
    expect((await started.completed).exitCode).toBe(0);
  });

  it("waits for bounded HTTP readiness", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ status: "ok" }),
    });
    try {
      const response = await waitForHttpReadiness(
        `http://127.0.0.1:${server.port}/health`,
        { timeoutMs: 1_000 },
      );
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await server.stop(true);
    }
  });

  it("reuses the runner-owned Brain tarball without packing another copy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "packed-artifact-reuse-"));
    try {
      const tarball = join(directory, "shared-brain.tgz");
      const destination = join(directory, "destination");
      await writeFile(tarball, "test tarball");

      const packed = await packPackages(
        [join(import.meta.dir, "..")],
        destination,
        { [PACKED_BRAIN_TARBALL_ENV]: tarball },
      );

      expect(packed.get("@rizom/brain")).toBe(tarball);
      expect(await readdir(destination)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("isolates packed, registry, and provider evidence behind separate opt-in flags", () => {
    expect(packedCompatibilityEvidenceEnabled({})).toBeFalse();
    expect(
      packedCompatibilityEvidenceEnabled({
        RIZOM_PUBLIC_API_PACKED_EVIDENCE: "1",
      }),
    ).toBeTrue();
    expect(
      packedCompatibilityEvidenceEnabled({
        RIZOM_PUBLIC_API_PACKED_EVIDENCE: "true",
      }),
    ).toBeFalse();
    expect(registryEvidenceEnabled({})).toBeFalse();
    expect(
      registryEvidenceEnabled({ RIZOM_PUBLIC_API_REGISTRY_EVIDENCE: "1" }),
    ).toBeTrue();
    expect(liveEvidenceEnabled({})).toBeFalse();
    expect(
      liveEvidenceEnabled({ RIZOM_PUBLIC_API_LIVE_EVIDENCE: "1" }),
    ).toBeTrue();
  });
});

/**
 * `bun install` extracts each tarball into a staging directory under the
 * spawned process's temp dir and renames it into place. When a packed test
 * times out or is killed mid-install the rename never happens and the staging
 * directory is orphaned. Pointing spawned processes at a temp root the harness
 * owns keeps those orphans inside something that gets removed.
 */
describe("packed consumer spawn isolation", () => {
  const readChildTempDir = async (
    options: Parameters<typeof runCommand>[2] = {},
  ): Promise<string> =>
    (
      await runCommand(
        ["bun", "-e", 'console.log(process.env.TMPDIR ?? "")'],
        import.meta.dir,
        options,
      )
    ).stdout.trim();

  it("runs spawned commands in a temp root of its own", async () => {
    const childTempDir = await readChildTempDir();

    expect(childTempDir).not.toBe(tmpdir());
    expect(childTempDir).toStartWith(join(tmpdir(), "packed-spawn-"));
    expect(existsSync(childTempDir)).toBeTrue();
  });

  it("overrides an inherited temp dir rather than staging in the shared one", async () => {
    const childTempDir = await readChildTempDir({
      env: { ...process.env, TMPDIR: tmpdir() },
    });

    expect(childTempDir).not.toBe(tmpdir());
    expect(childTempDir).toStartWith(join(tmpdir(), "packed-spawn-"));
  });

  it("isolates long-running commands the same way", async () => {
    const started = startCommand(
      ["bun", "-e", 'console.log(process.env.TMPDIR ?? "")'],
      import.meta.dir,
    );
    await started.completed;

    expect(started.getOutput().stdout.trim()).toStartWith(
      join(tmpdir(), "packed-spawn-"),
    );
  });

  it("removes what a spawned command leaves behind in the temp root", async () => {
    await runCommand(
      [
        "bun",
        "-e",
        'require("node:fs").mkdirSync(require("node:path").join(process.env.TMPDIR, ".abandoned-staging"), { recursive: true })',
      ],
      import.meta.dir,
    );
    const childTempDir = await readChildTempDir();
    const orphan = join(childTempDir, ".abandoned-staging");
    expect(existsSync(orphan)).toBeTrue();

    removeSpawnTempRoot();

    expect(existsSync(orphan)).toBeFalse();
    expect(existsSync(childTempDir)).toBeFalse();
  });

  it("hands out a fresh root after cleanup so later files do not spawn into a removed dir", async () => {
    const first = await readChildTempDir();
    removeSpawnTempRoot();
    const second = await readChildTempDir();

    expect(second).not.toBe(first);
    expect(second).toStartWith(join(tmpdir(), "packed-spawn-"));
    expect(existsSync(second)).toBeTrue();
  });

  it("keeps the root directly under the system temp dir", async () => {
    const childTempDir = await readChildTempDir();

    expect(childTempDir.slice(tmpdir().length + 1)).not.toContain(sep);
  });
});
