import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import {
  createHealthState,
  recordHeartbeat,
  isHealthy,
  HEARTBEAT_STALE_MS,
  type HealthState,
} from "../src/health-ipc";

/**
 * Create a minimal Hono app with just the /health route,
 * wired to the given health state — mirrors what standalone-server does.
 */
function createAppWithHealth(state: HealthState): Hono {
  const app = new Hono();
  app.get("/health", (c) => {
    if (isHealthy(state)) {
      return c.json({ status: "healthy" }, 200);
    }
    return c.json({ status: "unhealthy" }, 503);
  });
  return app;
}

describe("/health route", () => {
  it("should return 503 before any heartbeat", async () => {
    const state = createHealthState();
    const app = createAppWithHealth(state);

    const res = await app.request("/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("unhealthy");
  });

  it("should return 200 after a heartbeat", async () => {
    const state = createHealthState();
    recordHeartbeat(state);
    const app = createAppWithHealth(state);

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  it("should return 503 when heartbeat is stale", async () => {
    const state = createHealthState();
    // Record heartbeat far in the past
    recordHeartbeat(state, Date.now() - HEARTBEAT_STALE_MS - 1000);
    const app = createAppWithHealth(state);

    const res = await app.request("/health");
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("unhealthy");
  });

  it("should recover after a fresh heartbeat", async () => {
    const state = createHealthState();
    // Start stale
    recordHeartbeat(state, Date.now() - HEARTBEAT_STALE_MS - 1000);
    const app = createAppWithHealth(state);

    const staleRes = await app.request("/health");
    expect(staleRes.status).toBe(503);

    // Fresh heartbeat
    recordHeartbeat(state);

    const freshRes = await app.request("/health");
    expect(freshRes.status).toBe(200);
  });
});
