import { describe, expect, it, mock } from "bun:test";
import { createMockProgressReporter } from "@brains/test-utils";
import {
  renewOnAdvance,
  createRenewableDeadline,
} from "../src/progress-deadline";

describe("progress-renewed deadline", () => {
  it("observes reports, subreporters and callbacks without treating heartbeats as advancement", async () => {
    const inner = createMockProgressReporter();
    const callback = mock(async () => {});
    inner.toCallback = (): typeof callback => callback;
    const renew = mock(() => {});
    const reporter = renewOnAdvance(inner, renew);
    const notification = { progress: 1, total: 2, message: "Preparing" };
    await reporter.report(notification);
    await reporter.report(notification);
    reporter.startHeartbeat("Still preparing", 10);
    reporter.stopHeartbeat();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(inner.report).toHaveBeenCalledTimes(2);
    expect(inner.startHeartbeat).toHaveBeenCalledWith("Still preparing", 10);
    expect(inner.stopHeartbeat).toHaveBeenCalledTimes(1);

    const sub = reporter.createSub({ scale: { start: 25, end: 50 } });
    await sub.report({ ...notification, progress: 2 });
    await sub.toCallback()({ ...notification, progress: 2 });
    expect(renew).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith({ ...notification, progress: 2 });
    await sub.toCallback()({
      ...notification,
      progress: 2,
      message: "Rendering",
    });
    expect(renew).toHaveBeenCalledTimes(3);
  });

  it("cannot revive a cancelled deadline", async () => {
    const deadline = createRenewableDeadline(1);
    deadline.cancel();
    deadline.renew();
    const result = await Promise.race([
      deadline.expired,
      Bun.sleep(10).then(() => "cancelled"),
    ]);
    expect(result).toBe("cancelled");
  });

  it("expires without progress and remains terminal after renewal", async () => {
    const deadline = createRenewableDeadline(1);
    expect(await deadline.expired).toEqual({ kind: "timeout" });
    deadline.renew();
    expect(await deadline.expired).toEqual({ kind: "timeout" });
    deadline.cancel();
  });
});
