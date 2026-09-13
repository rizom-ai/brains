import { it, expect } from "bun:test";
import assert from "node:assert/strict";
import { ReplyIdentity } from "../src/turso-worker/reply-identity";
import {
  PendingRequests,
  type PendingRequest,
} from "../src/turso-worker/pending-requests";
import { CommandAdmission } from "../src/turso-worker/command-admission";

it("pins the spawned worker identity after exactly one handshake", () => {
  const reply = { generation: crypto.randomUUID(), pid: 42, threadId: 7 };
  const identity = new ReplyIdentity(reply.generation, reply.pid);
  assert.throws(() => identity.accept(reply, false, 7), /preceded handshake/);
  assert.throws(() => identity.accept(reply, true, 8), /spawned thread/);
  assert.throws(
    () =>
      identity.accept({ ...reply, generation: crypto.randomUUID() }, true, 7),
    /identity mismatch/,
  );
  assert.throws(
    () => identity.accept({ ...reply, pid: 43 }, true, 7),
    /identity mismatch/,
  );
  identity.accept(reply, true, 7);
  assert.throws(() => identity.accept(reply, true, 7), /Duplicate/);
  const accepted = { ...reply };
  reply.threadId = 9;
  assert.throws(() => identity.accept(reply, false, 7), /identity mismatch/);
  expect(() => identity.accept(accepted, false, 7)).not.toThrow();
});

it("retires pending metadata once and shares the terminal rejection object", () => {
  const pending = new PendingRequests<PendingRequest>();
  const admission = new CommandAdmission({ role: "sender" });
  const rejected: Error[] = [];
  const entry = (): PendingRequest => ({
    releaseAdmission: admission.reserve("ordinary", 256),
    reject: (error: Error): void => {
      rejected.push(error);
    },
  });
  const first = entry();
  const second = entry();
  const third = entry();
  pending.register(1, first);
  pending.register(3, second); // Rejected-before-post IDs may leave gaps.
  pending.register(4, third);
  assert.throws(() => pending.register(2, first), /reused pending/);
  assert.throws(() => pending.retire(1, second), /identity mismatch/);
  assert.equal(admission.stats().ordinary, 3);
  pending.retire(1, first);
  assert.throws(() => pending.retire(1, first), /stale persistence reply/);
  const failure = new Error("Owner lost");
  pending.rejectAll(failure);
  pending.rejectAll(failure);
  expect(rejected).toHaveLength(2);
  assert.equal(rejected[0], failure);
  assert.equal(rejected[1], failure);
  assert.equal(pending.size, 0);
  assert.equal(admission.stats().ordinary, 0);
  assert.equal(admission.stats().pendingBytes, 0);
  assert.throws(() => pending.require(3), /stale persistence reply/);
});
