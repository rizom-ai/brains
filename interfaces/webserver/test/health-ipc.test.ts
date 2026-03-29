import { describe, it, expect } from "bun:test";
import {
  healthMessageSchema,
  createHealthState,
  recordHeartbeat,
  isHealthy,
  HEARTBEAT_STALE_MS,
} from "../src/health-ipc";

describe("healthMessageSchema", () => {
  it("should accept a valid heartbeat message", () => {
    const result = healthMessageSchema.safeParse({ type: "heartbeat" });
    expect(result.success).toBe(true);
  });

  it("should reject an unknown message type", () => {
    const result = healthMessageSchema.safeParse({ type: "ping" });
    expect(result.success).toBe(false);
  });

  it("should reject missing type", () => {
    const result = healthMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("health state", () => {
  it("should start with no heartbeat", () => {
    const state = createHealthState();
    expect(state.lastHeartbeat).toBeNull();
  });

  it("should be unhealthy before any heartbeat", () => {
    const state = createHealthState();
    expect(isHealthy(state)).toBe(false);
  });

  it("should be healthy immediately after a heartbeat", () => {
    const state = createHealthState();
    const now = 1000;
    recordHeartbeat(state, now);
    expect(isHealthy(state, now)).toBe(true);
  });

  it("should be healthy within the staleness window", () => {
    const state = createHealthState();
    const now = 1000;
    recordHeartbeat(state, now);
    expect(isHealthy(state, now + HEARTBEAT_STALE_MS - 1)).toBe(true);
  });

  it("should be healthy at exactly the staleness boundary", () => {
    const state = createHealthState();
    const now = 1000;
    recordHeartbeat(state, now);
    expect(isHealthy(state, now + HEARTBEAT_STALE_MS)).toBe(true);
  });

  it("should be unhealthy after the staleness window", () => {
    const state = createHealthState();
    const now = 1000;
    recordHeartbeat(state, now);
    expect(isHealthy(state, now + HEARTBEAT_STALE_MS + 1)).toBe(false);
  });

  it("should reset staleness on new heartbeat", () => {
    const state = createHealthState();
    recordHeartbeat(state, 1000);
    // Almost stale
    expect(isHealthy(state, 1000 + HEARTBEAT_STALE_MS - 1)).toBe(true);
    // New heartbeat resets the clock
    recordHeartbeat(state, 1000 + HEARTBEAT_STALE_MS - 1);
    // Now healthy again from the new baseline
    expect(
      isHealthy(state, 1000 + HEARTBEAT_STALE_MS - 1 + HEARTBEAT_STALE_MS),
    ).toBe(true);
  });
});
