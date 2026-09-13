import { describe, it, expect } from "bun:test";
import assert from "node:assert/strict";
import { CommandAdmission } from "../src/turso-worker/command-admission";

const empty = { ordinary: 0, controls: 0, cleanupRequests: 0, pendingBytes: 0 };
describe("command metadata admission", () => {
  it.each(["sender", "receiver"] as const)(
    "preserves %s reserved lanes under ordinary saturation",
    (role) => {
      const admission = new CommandAdmission({ role, maxInFlight: 1 });
      const releases = [admission.reserve("ordinary", 256)];
      assert.throws(() => admission.reserve("ordinary", 1), /overloaded/);
      releases.push(
        admission.reserve("control", 1),
        admission.reserve("control", 1),
      );
      if (role === "sender")
        assert.throws(() => admission.reserve("control", 1), /overloaded/);
      releases.push(admission.reserve("close", 1));
      assert.throws(() => admission.reserve("control", 1), /overloaded/);
      if (role === "receiver")
        assert.throws(() => admission.reserve("close", 1), /overloaded/);
      releases.push(
        admission.reserve("cleanup", 1),
        admission.reserve("cleanup", 1),
      );
      assert.throws(() => admission.reserve("cleanup", 1), /overloaded/);
      expect(admission.stats()).toEqual({
        ordinary: 1,
        controls: 3,
        cleanupRequests: 2,
        pendingBytes: 256,
      });
      for (const release of releases.reverse()) release();
      assert.deepEqual(admission.stats(), empty);
      for (const release of releases)
        assert.throws(release, /already released/);
      assert.deepEqual(admission.stats(), empty);
    },
  );
  it("rejects byte overflow without consuming admission", () => {
    const admission = new CommandAdmission({
      role: "sender",
      maxPendingBytes: 256,
    });
    const release = admission.reserve("ordinary", 256);
    assert.throws(() => admission.reserve("ordinary", 1), /overloaded/);
    assert.throws(() => admission.reserve("ordinary", -1), /byte count/);
    release();
    const next = admission.reserve("ordinary", 256);
    expect(admission.stats().ordinary).toBe(1);
    next();
    assert.deepEqual(admission.stats(), empty);
    assert.throws(
      () => new CommandAdmission({ role: "sender", maxInFlight: 17 }),
      /Invalid proof driver admission limits/,
    );
  });
});
