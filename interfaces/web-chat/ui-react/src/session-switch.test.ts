import { describe, expect, it } from "bun:test";
import { runSessionSwitch } from "./session-switch";

interface LoadedSession {
  id: string;
  hasCard: boolean;
}

describe("runSessionSwitch", () => {
  it("keeps the latest card session and suppresses an older request error", async () => {
    const olderLoad = Promise.withResolvers<LoadedSession>();
    let latestRequestId = 1;
    const displayedSessions: LoadedSession[] = [];
    const errors: unknown[] = [];
    let settledRequests = 0;

    const olderRun = runSessionSwitch({
      load: () => olderLoad.promise,
      isCurrent: () => latestRequestId === 1,
      onSuccess: (session) => displayedSessions.push(session),
      onError: (error) => errors.push(error),
      onSettled: () => {
        settledRequests += 1;
      },
    });

    latestRequestId = 2;
    await runSessionSwitch({
      load: () => Promise.resolve({ id: "card-session", hasCard: true }),
      isCurrent: () => latestRequestId === 2,
      onSuccess: (session) => displayedSessions.push(session),
      onError: (error) => errors.push(error),
      onSettled: () => {
        settledRequests += 1;
      },
    });

    olderLoad.reject(new Error("Could not reopen the older session"));
    await olderRun;

    expect(displayedSessions).toEqual([{ id: "card-session", hasCard: true }]);
    expect(errors).toEqual([]);
    expect(settledRequests).toBe(1);
  });
});
