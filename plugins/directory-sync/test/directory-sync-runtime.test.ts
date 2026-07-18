import { describe, expect, it } from "bun:test";
import { DirectorySyncRuntime } from "../src/lib/directory-sync-runtime";

describe("DirectorySyncRuntime", () => {
  it("releases an acquired resource exactly once", async () => {
    const runtime = new DirectorySyncRuntime();
    const releases: string[] = [];

    const resource = await runtime.acquire(
      () => Promise.resolve("watcher"),
      (value) => {
        releases.push(value);
        return Promise.resolve();
      },
    );

    expect(resource).toBe("watcher");
    await runtime.close();
    await runtime.close();
    expect(releases).toEqual(["watcher"]);
  });

  it("preserves acquisition and release error identity", async () => {
    const acquisitionRuntime = new DirectorySyncRuntime();
    const acquisitionError = new Error("watcher start failed");
    let receivedAcquisitionError: unknown;
    try {
      await acquisitionRuntime.acquire(
        () => Promise.reject(acquisitionError),
        () => Promise.resolve(),
      );
    } catch (error) {
      receivedAcquisitionError = error;
    }
    expect(receivedAcquisitionError).toBe(acquisitionError);
    await acquisitionRuntime.close();

    const releaseRuntime = new DirectorySyncRuntime();
    const releaseError = new Error("watcher stop failed");
    await releaseRuntime.acquire(
      () => Promise.resolve("watcher"),
      () => Promise.reject(releaseError),
    );
    let receivedReleaseError: unknown;
    try {
      await releaseRuntime.close();
    } catch (error) {
      receivedReleaseError = error;
    }
    expect(receivedReleaseError).toBe(releaseError);
  });

  it("rejects acquisition after closure", async () => {
    const runtime = new DirectorySyncRuntime();
    await runtime.close();

    let receivedError: unknown;
    try {
      await runtime.acquire(
        () => Promise.resolve("watcher"),
        () => Promise.resolve(),
      );
    } catch (error) {
      receivedError = error;
    }
    expect(receivedError).toBeInstanceOf(Error);
    if (!(receivedError instanceof Error)) {
      throw new Error("Expected runtime acquisition to fail");
    }
    expect(receivedError.message).toBe("Directory sync runtime is closed");
  });
});
