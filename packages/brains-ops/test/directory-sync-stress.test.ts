import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDirectorySyncStressTarget,
  resolveDirectorySyncStressPlan,
  runDirectorySyncStressPlan,
  sampleStressHealth,
  stressMetricsFailure,
  type DirectorySyncStressDriver,
} from "../src/directory-sync-stress";
import {
  applyDirectorySyncStressPhase,
  listProbeFiles,
  parseStressRuntimeSample,
  removeProbeFiles,
} from "../src/directory-sync-stress-system";

describe("directory-sync stress profiles", () => {
  it("defines deterministic regression, load, and stress ramps", () => {
    const regression = resolveDirectorySyncStressPlan("regression");
    const load = resolveDirectorySyncStressPlan("load");
    const stress = resolveDirectorySyncStressPlan("stress");

    expect(regression.phases.map((phase) => phase.id)).toEqual([
      "add20",
      "update20",
      "delete20",
    ]);
    expect(regression.maximumProbeCount).toBe(20);

    expect(load.phases.map((phase) => phase.id)).toEqual([
      "add50",
      "add150",
      "add350",
      "update350a",
      "rename100",
      "update350b",
      "delete350",
    ]);
    expect(load.maximumProbeCount).toBe(350);

    expect(stress.maximumProbeCount).toBe(700);
    expect(stress.phases.at(-1)).toMatchObject({
      id: "delete700",
      operation: "delete",
      count: 700,
    });
  });
});

describe("directory-sync stress safety", () => {
  it("accepts an explicitly confirmed smoke target", () => {
    expect(() =>
      assertDirectorySyncStressTarget({
        handle: "smoke",
        domain: "smoke.rizom.ai",
        contentRepo: "rover-smoke-content",
        confirmation: "stress:smoke",
      }),
    ).not.toThrow();
  });

  it("rejects production-like targets even when explicitly confirmed", () => {
    expect(() =>
      assertDirectorySyncStressTarget({
        handle: "yeehaa",
        domain: "yeehaa.io",
        contentRepo: "yeehaa-content",
        confirmation: "stress:yeehaa",
      }),
    ).toThrow("smoke-only");
  });

  it("rejects mismatched confirmation", () => {
    expect(() =>
      assertDirectorySyncStressTarget({
        handle: "smoke",
        domain: "smoke.rizom.ai",
        contentRepo: "rover-smoke-content",
        confirmation: "smoke",
      }),
    ).toThrow("stress:smoke");
  });
});

describe("directory-sync stress probe lifecycle", () => {
  it("adds, updates, renames, and removes only deterministic probe files", async () => {
    const root = await mkdtemp(join(tmpdir(), "directory-sync-stress-test-"));
    await writeFile(join(root, "keep.md"), "keep\n");

    await applyDirectorySyncStressPhase(root, {
      id: "add2",
      operation: "add",
      count: 2,
      targetProbeCount: 2,
      settleMs: 0,
    });
    expect(await listProbeFiles(root)).toEqual([
      "directory-sync-stress-001.md",
      "directory-sync-stress-002.md",
    ]);

    await applyDirectorySyncStressPhase(root, {
      id: "update2",
      operation: "update",
      count: 2,
      targetProbeCount: 2,
      settleMs: 0,
    });
    expect(
      await readFile(join(root, "directory-sync-stress-001.md"), "utf8"),
    ).toContain("Update marker: update2.");

    await applyDirectorySyncStressPhase(root, {
      id: "rename1",
      operation: "rename",
      count: 1,
      targetProbeCount: 2,
      settleMs: 0,
    });
    expect(await listProbeFiles(root)).toEqual([
      "directory-sync-stress-002.md",
      "directory-sync-stress-renamed-001.md",
    ]);

    expect(await removeProbeFiles(root)).toBe(2);
    expect(await listProbeFiles(root)).toEqual([]);
    expect(await readFile(join(root, "keep.md"), "utf8")).toBe("keep\n");
  });

  it("parses comma-delimited Docker runtime samples", () => {
    expect(
      parseStressRuntimeSample("53.62%,15.86%,25", "2026-08-05T17:00:00.000Z"),
    ).toEqual({
      timestamp: "2026-08-05T17:00:00.000Z",
      cpuPercent: 53.62,
      memoryPercent: 15.86,
      pids: 25,
    });
  });
});

describe("directory-sync stress observations", () => {
  it("classifies health, external-AI, restart, OOM, and stopped-container failures", () => {
    expect(
      stressMetricsFailure({
        health: [],
        runtime: [],
        externalAiCalls: 0,
        container: { status: "running", restartCount: 0, oomKilled: false },
      }),
    ).toBeUndefined();
    expect(
      stressMetricsFailure({
        health: [
          {
            timestamp: "2026-08-05T17:00:00.000Z",
            endpoint: "/health/ready",
            status: 503,
            durationMs: 10,
            ok: false,
          },
        ],
        runtime: [],
      }),
    ).toBe("health: /health/ready unavailable");
    expect(
      stressMetricsFailure({
        health: [],
        runtime: [],
        externalAiCalls: 2,
      }),
    ).toBe("external AI: observed 2 call(s)");
    expect(
      stressMetricsFailure({
        health: [],
        runtime: [],
        container: { status: "running", restartCount: 1, oomKilled: false },
      }),
    ).toBe("container: restarted 1 time(s)");
    expect(
      stressMetricsFailure({
        health: [],
        runtime: [],
        container: { status: "running", restartCount: 0, oomKilled: true },
      }),
    ).toBe("container: OOM killed");
    expect(
      stressMetricsFailure({
        health: [],
        runtime: [],
        container: { status: "exited", restartCount: 0, oomKilled: false },
      }),
    ).toBe("container: exited");
  });

  it("records a health timeout as a failed sample instead of throwing", async () => {
    const sample = await sampleStressHealth(
      "https://smoke.rizom.ai/health/ready",
      {
        fetchImpl() {
          return Promise.reject(new DOMException("timed out", "AbortError"));
        },
        now: () => new Date("2026-08-05T17:00:00.000Z"),
        timeoutMs: 10,
      },
    );

    expect(sample).toEqual({
      timestamp: "2026-08-05T17:00:00.000Z",
      endpoint: "/health/ready",
      status: 0,
      durationMs: 0,
      ok: false,
      error: "AbortError: timed out",
    });
  });
});

describe("directory-sync stress orchestration", () => {
  it("cleans up when monitoring fails to start", async () => {
    const calls: string[] = [];
    const driver: DirectorySyncStressDriver = {
      async prepare() {
        calls.push("prepare");
        return { entities: 41, notes: 7, version: "0.2.0-alpha.253" };
      },
      async startMonitoring() {
        calls.push("monitor:start");
        throw new Error("monitor unavailable");
      },
      async executePhase() {
        throw new Error("phase must not run");
      },
      async cleanup() {
        calls.push("cleanup");
        return { success: true, probesRemaining: 0 };
      },
      async stopMonitoring() {
        calls.push("monitor:stop");
        return { health: [], runtime: [] };
      },
    };

    const report = await runDirectorySyncStressPlan(
      resolveDirectorySyncStressPlan("regression"),
      driver,
    );

    expect(report.success).toBe(false);
    expect(report.failure).toBe("monitor: monitor unavailable");
    expect(calls).toEqual([
      "prepare",
      "monitor:start",
      "cleanup",
      "monitor:stop",
    ]);
  });

  it("fails the gate when monitoring records health unavailability", async () => {
    const driver: DirectorySyncStressDriver = {
      async prepare() {
        return { entities: 41, notes: 7, version: "0.2.0-alpha.253" };
      },
      async startMonitoring() {},
      async executePhase(phase) {
        return {
          id: phase.id,
          operation: phase.operation,
          count: phase.count,
          success: true,
        };
      },
      async cleanup() {
        return { success: true, probesRemaining: 0 };
      },
      async stopMonitoring() {
        return {
          health: [
            {
              timestamp: "2026-08-05T17:00:00.000Z",
              endpoint: "/health/ready",
              status: 0,
              durationMs: 20_000,
              ok: false,
              error: "AbortError: timed out",
            },
          ],
          runtime: [],
        };
      },
    };

    const report = await runDirectorySyncStressPlan(
      resolveDirectorySyncStressPlan("regression"),
      driver,
    );

    expect(report.success).toBe(false);
    expect(report.failure).toBe("health: /health/ready unavailable");
  });

  it("stops applying load and always cleans up after a failed phase", async () => {
    const calls: string[] = [];
    const driver: DirectorySyncStressDriver = {
      async prepare() {
        calls.push("prepare");
        return { entities: 41, notes: 7, version: "0.2.0-alpha.253" };
      },
      async startMonitoring() {
        calls.push("monitor:start");
      },
      async executePhase(phase) {
        calls.push(`phase:${phase.id}`);
        if (phase.id === "rename100") {
          throw new Error("health unavailable");
        }
        return {
          id: phase.id,
          operation: phase.operation,
          count: phase.count,
          success: true,
          commitLatencyMs: 1,
          persistenceLatencyMs: 1,
        };
      },
      async cleanup() {
        calls.push("cleanup");
        return {
          success: true,
          probesRemaining: 0,
          finalEntities: 41,
          finalNotes: 7,
        };
      },
      async stopMonitoring() {
        calls.push("monitor:stop");
        return { health: [], runtime: [] };
      },
    };

    const report = await runDirectorySyncStressPlan(
      resolveDirectorySyncStressPlan("load"),
      driver,
    );

    expect(report.success).toBe(false);
    expect(report.failure).toBe("rename100: health unavailable");
    expect(report.phases.at(-1)).toMatchObject({
      id: "rename100",
      success: false,
      error: "health unavailable",
    });
    expect(calls).toContain("cleanup");
    expect(calls.at(-1)).toBe("monitor:stop");
    expect(calls).not.toContain("phase:update350b");
  });
});
