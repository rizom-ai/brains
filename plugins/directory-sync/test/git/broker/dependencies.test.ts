import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GitExecutor,
  MissingWrapperDependencyError,
  WRAPPER_DEPENDENCIES,
} from "../../../src/lib/broker/executor";

/**
 * The wrapper is a shell script with real external dependencies. A packaged
 * image that lost one would otherwise fail deep inside a Git command, as an
 * unexplained non-zero exit under a lock — so the executor refuses to start
 * instead, naming what is missing.
 */

let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("wrapper dependencies", () => {
  it("names every binary the wrapper needs", () => {
    // Pinned deliberately: each is used by git-wrapper.sh, and a silent
    // addition there should force a deliberate change here.
    expect([...WRAPPER_DEPENDENCIES]).toEqual([
      "bash",
      "flock",
      "setsid",
      "timeout",
      "git",
    ]);
  });

  it("refuses to start when a dependency is missing, naming it", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-deps-"));

    const outcome = await GitExecutor.create({
      runtimeDir: join(scratch, "runtime"),
      which: (name) => (name === "setsid" ? null : `/usr/bin/${name}`),
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(MissingWrapperDependencyError);
    expect(String(outcome)).toContain("setsid");
  });

  it("reports every missing dependency, not just the first", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-deps-many-"));

    const outcome = await GitExecutor.create({
      runtimeDir: join(scratch, "runtime"),
      which: (name) => (name === "bash" ? "/usr/bin/bash" : null),
    }).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("flock");
    expect(outcome).toContain("setsid");
    expect(outcome).toContain("timeout");
    expect(outcome).toContain("git");
    expect(outcome).not.toContain("bash");
  });

  it("starts when every dependency resolves", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-deps-ok-"));

    const executor = await GitExecutor.create({
      runtimeDir: join(scratch, "runtime"),
      which: (name) => `/usr/bin/${name}`,
    });

    expect(executor.runtimeDir).toContain("runtime");
  });

  it("resolves every dependency in this environment", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-deps-real-"));

    // No injected resolver: this is the check the packaged image must pass.
    const executor = await GitExecutor.create({
      runtimeDir: join(scratch, "runtime"),
    });

    expect(executor.brokerId).toBeTruthy();
  });
});
