import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import {
  controlStartSchema,
  controlEventSchema,
  controlCommandSchema,
} from "./fixtures/turso-read-control-protocol";

const prefix = { sizeBytes: 17 * 1024 * 1024, sha256: "0".repeat(64) };
describe("separate read control process metadata", () => {
  it("keeps IPC readiness distinct from confirmed local-open fencing", () => {
    const ready = {
      kind: "ready" as const,
      pid: 2,
      executable: "/bin/bun",
      sidecarUrl: "file:///tmp/control.ts",
    };
    expect(controlEventSchema.parse(ready)).toEqual(ready);
    assert.equal(
      controlEventSchema.safeParse({ ...ready, localOpenFenced: true }).success,
      false,
    );
    assert.equal(
      controlEventSchema.safeParse({ ...ready, kind: "runtime" }).success,
      false,
    );
  });
  it("accepts bounded setup but not caller-supplied environment overrides or payloads", () => {
    const start = {
      kind: "start",
      config: {
        address: "/tmp/control.sock",
        secret: "private-fixture",
        sessionId: "worker",
      },
      consumerUrl: "file:///tmp/consumer.ts",
      nativeWorkerUrl: "file:///tmp/native.ts",
      forbiddenUrl: "file:///tmp/forbidden.db",
      bunExecutable: "/bin/bun",
    };
    expect(controlStartSchema.safeParse(start).success).toBe(true);
    assert.equal(
      controlStartSchema.safeParse({
        ...start,
        env: { BRAINS_FORBID_LOCAL_DATABASE_OPEN: "0" },
      }).success,
      false,
    );
    assert.equal(
      controlStartSchema.safeParse({ ...start, payload: new Uint8Array(1) })
        .success,
      false,
    );
    assert.equal(
      controlStartSchema.safeParse({ ...start, consumerUrl: "x".repeat(4097) })
        .success,
      false,
    );
  });
  it("allows only metadata at the held-credit and completion boundary", () => {
    const held = { kind: "held", pid: 2, consumerPid: 3, prefix };
    expect(controlEventSchema.safeParse(held).success).toBe(true);
    assert.equal(
      controlEventSchema.safeParse({ ...held, bytes: new Uint8Array(1) })
        .success,
      false,
    );
    assert.equal(
      controlEventSchema.safeParse({
        ...held,
        prefix: { ...prefix, sizeBytes: 100 * 1024 * 1024 + 1 },
      }).success,
      false,
    );
    assert.equal(
      controlEventSchema.safeParse({
        kind: "finished",
        pid: 2,
        consumerPid: 3,
        action: "complete",
        consumerJoined: false,
        controlReusableAfterCancel: false,
      }).success,
      false,
    );
    assert.equal(
      controlEventSchema.safeParse({
        kind: "runtime",
        pid: 2,
        executable: "/bin/bun",
        sidecarUrl: "file:///tmp/control.ts",
        localOpenFenced: false,
      }).success,
      false,
    );
  });
  it("does not expose SQL, bytes or automatic retry through the command channel", () => {
    expect(
      controlCommandSchema.parse({ kind: "finish", action: "cancel" }),
    ).toEqual({ kind: "finish", action: "cancel" });
    for (const command of [
      { kind: "execute", sql: "SELECT 1" },
      { kind: "finish", action: "retry" },
      { kind: "endpoint-ready", bytes: new Uint8Array(1) },
    ])
      assert.equal(controlCommandSchema.safeParse(command).success, false);
  });
});
