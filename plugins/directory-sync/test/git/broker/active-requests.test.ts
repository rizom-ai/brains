import { describe, expect, it } from "bun:test";
import { ActiveRequests } from "../../../src/lib/broker/active-requests";

/**
 * Review blocker 5.
 *
 * Every accepted request was marked active on arrival, so a request queued
 * behind a long operation became the oldest "progress" and the supervisor
 * terminated a broker whose actual work was advancing fine. Waiting is what a
 * queue is for; only the request holding the turn can be stale.
 */

describe("what the checkout is doing", () => {
  it("counts no progress age for a request that is only waiting", () => {
    const requests = new ActiveRequests();
    requests.accept("req_running000001", "/brain/brain-data", 1_000);
    requests.start("req_running000001", 1_000);
    requests.progress("req_running000001", 9_000);

    // Queued at 5s, long after the running operation started, and still
    // advancing at 9s. Counting the wait made this look 4s stale.
    requests.accept("req_waiting000001", "/brain/brain-data", 5_000);

    const snapshot = requests.snapshot();
    expect(snapshot.oldestActiveProgressAt).toBe(9_000);
    expect(snapshot.activeRequestIds).toEqual(["req_running000001"]);
    expect(snapshot.queuedRequestIds).toEqual(["req_waiting000001"]);
  });

  it("starts counting once the request holds the turn", () => {
    const requests = new ActiveRequests();
    requests.accept("req_waiting000001", "/brain/brain-data", 5_000);
    expect(requests.snapshot().oldestActiveProgressAt).toBeNull();

    requests.start("req_waiting000001", 7_000);
    expect(requests.snapshot()).toMatchObject({
      oldestActiveProgressAt: 7_000,
      activeRequestIds: ["req_waiting000001"],
      queuedRequestIds: [],
    });
  });

  it("ignores progress from a request that never started", () => {
    // Progress belongs to an executing operation. Accepting it from a queued
    // one would let the queue refresh a deadline it is not responsible for.
    const requests = new ActiveRequests();
    requests.accept("req_waiting000001", "/brain/brain-data", 5_000);
    requests.progress("req_waiting000001", 6_000);

    expect(requests.snapshot().oldestActiveProgressAt).toBeNull();
  });

  it("reports the oldest of several executing turns", () => {
    // Different checkouts run concurrently; the stalest one is what health
    // and supervision care about.
    const requests = new ActiveRequests();
    requests.accept("req_first00000001", "/brain/one", 1_000);
    requests.start("req_first00000001", 1_000);
    requests.accept("req_second0000001", "/brain/two", 2_000);
    requests.start("req_second0000001", 2_000);
    requests.progress("req_second0000001", 8_000);

    expect(requests.snapshot().oldestActiveProgressAt).toBe(1_000);
  });

  it("forgets a request that finished", () => {
    const requests = new ActiveRequests();
    requests.accept("req_done00000001", "/brain/brain-data", 1_000);
    requests.start("req_done00000001", 1_000);
    requests.finish("req_done00000001");

    expect(requests.snapshot()).toEqual({
      activeRequestIds: [],
      queuedRequestIds: [],
      oldestActiveProgressAt: null,
    });
  });
});
