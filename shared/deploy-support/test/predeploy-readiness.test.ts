import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import {
  predeployBackupNotices,
  renderPredeployBackupRemoteScript,
  renderPredeployReadinessProgram,
} from "../src/deploy-scripts/create-predeploy-backup";

const idleQueue = {
  totals: { pending: 0, processing: 0 },
  staleLeaseCount: 0,
};

async function gate(
  status: number,
  health: unknown,
): Promise<{ exitCode: number; stderr: string }> {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => Response.json(health, { status }),
  });
  try {
    const result = await runProcess([
      process.execPath,
      "-e",
      renderPredeployReadinessProgram(
        `http://127.0.0.1:${server.port}/health/ready`,
      ),
    ]);
    return { exitCode: result.exitCode, stderr: result.stderr };
  } finally {
    await server.stop(true);
  }
}

describe("0.3 predeploy readiness", () => {
  it("runs the gate inside the current runtime before stopping writers", () => {
    const script = renderPredeployBackupRemoteScript();
    const invocation = `docker exec "$container" bun -e '\n${renderPredeployReadinessProgram()}'`;
    expect(script).toContain(invocation);
    expect(script.indexOf(invocation)).toBeLessThan(
      script.indexOf("docker stop -t -1"),
    );
    expect(renderPredeployReadinessProgram()).not.toContain("'");
  });

  it("accepts affirmative ready, operational, idle-queue evidence", async () => {
    expect(
      await gate(200, {
        status: "ready",
        operationalStatus: "operational",
        resources: { queue: idleQueue },
      }),
    ).toEqual({ exitCode: 0, stderr: "" });
  });

  it.each([
    { name: "missing queue", queue: undefined },
    { name: "null queue", queue: null },
    { name: "missing counters", queue: {} },
    { name: "missing lease evidence", queue: { totals: idleQueue.totals } },
    {
      name: "pending jobs",
      queue: { ...idleQueue, totals: { pending: 1, processing: 0 } },
    },
    {
      name: "active processing jobs",
      queue: { ...idleQueue, totals: { pending: 0, processing: 1 } },
    },
    {
      name: "expired processing leases",
      queue: { totals: { pending: 0, processing: 1 }, staleLeaseCount: 1 },
    },
    {
      name: "inconsistent stale lease count",
      queue: { ...idleQueue, staleLeaseCount: 1 },
    },
  ])("refuses $name without granting retry authority", async ({ queue }) => {
    const result = await gate(200, {
      status: "ready",
      operationalStatus: "operational",
      resources: { queue },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("job queue is not idle");
    expect(result.stderr).not.toContain("will rerun");
  });

  it("retains the operational-status gate", async () => {
    const result = await gate(200, {
      status: "ready",
      operationalStatus: "degraded",
      resources: { queue: idleQueue },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("current runtime is not operational");
  });

  it.each([
    { status: 503, readiness: "ready" },
    { status: 200, readiness: "not_ready" },
  ])(
    "requires successful readiness evidence: $status/$readiness",
    async ({ status, readiness }) => {
      const result = await gate(status, {
        status: readiness,
        operationalStatus: "operational",
        resources: { queue: idleQueue },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("current runtime is not ready");
    },
  );
});

describe("predeploy backup notices", () => {
  it("forwards only runtime notices, not unrelated remote output", () => {
    expect(
      predeployBackupNotices(
        "pre-deploy snapshot: diagnostic notice\nWarning: Permanently added host\n",
      ),
    ).toEqual(["::warning title=Pre-deploy backup::diagnostic notice"]);
    expect(predeployBackupNotices("")).toEqual([]);
  });
});
