import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import chokidar, { FSWatcher } from "chokidar";
import { createSilentLogger } from "@brains/test-utils";
import { Effect } from "@brains/utils/effect";
import { TestClock, TestContext } from "@brains/utils/effect/test";
import { FileWatcher, shouldProcessPath } from "../src/lib/file-watcher";

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("shouldProcessPath", () => {
  const syncPath = "/data/brain";

  it("should process .md files in entity type directories", () => {
    expect(shouldProcessPath(`${syncPath}/post/hello.md`, syncPath)).toBe(true);
    expect(shouldProcessPath(`${syncPath}/link/ref.md`, syncPath)).toBe(true);
  });

  it("should process image files in image/ directory", () => {
    expect(shouldProcessPath(`${syncPath}/image/photo.png`, syncPath)).toBe(
      true,
    );
    expect(shouldProcessPath(`${syncPath}/image/banner.jpg`, syncPath)).toBe(
      true,
    );
  });

  it("should reject files in underscore-prefixed directories", () => {
    expect(
      shouldProcessPath(`${syncPath}/_obsidian/templates/post.md`, syncPath),
    ).toBe(false);
    expect(
      shouldProcessPath(`${syncPath}/_obsidian/fileClasses/post.md`, syncPath),
    ).toBe(false);
    expect(
      shouldProcessPath(`${syncPath}/_config/something.md`, syncPath),
    ).toBe(false);
  });

  it("should reject non-md, non-image files", () => {
    expect(shouldProcessPath(`${syncPath}/post/data.json`, syncPath)).toBe(
      false,
    );
    expect(shouldProcessPath(`${syncPath}/post/notes.txt`, syncPath)).toBe(
      false,
    );
  });

  it("should reject image files outside image/ directory", () => {
    expect(shouldProcessPath(`${syncPath}/post/photo.png`, syncPath)).toBe(
      false,
    );
  });

  it("should process root-level .md files", () => {
    expect(shouldProcessPath(`${syncPath}/notes.md`, syncPath)).toBe(true);
  });
});

describe("FileWatcher lifecycle characterization", () => {
  let restoreWatch: (() => void) | undefined;

  afterEach(() => {
    restoreWatch?.();
    restoreWatch = undefined;
  });

  function installWatcher(fakeWatcher: FSWatcher): void {
    const watchSpy = spyOn(chokidar, "watch").mockReturnValue(fakeWatcher);
    restoreWatch = (): void => watchSpy.mockRestore();
  }

  async function startWatcher(
    watcher: FileWatcher,
    fakeWatcher: FSWatcher,
  ): Promise<void> {
    const starting = watcher.start();
    fakeWatcher.emit("ready");
    await starting;
  }

  it("waits for Chokidar close to settle", async () => {
    const closeGate = deferred();
    const fakeWatcher = new FSWatcher();
    const close = mock((): Promise<void> => closeGate.promise);
    fakeWatcher.close = close;
    installWatcher(fakeWatcher);
    const watcher = new FileWatcher({
      syncPath: "/tmp/file-watcher-close",
      watchInterval: 100,
      logger: createSilentLogger("file-watcher-close"),
    });

    await startWatcher(watcher, fakeWatcher);
    const stopping = watcher.stop();

    expect(close).toHaveBeenCalledTimes(1);
    let stopSettled = false;
    void stopping.then(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);

    closeGate.resolve();
    await stopping;
    expect(stopSettled).toBe(true);
  });

  it("waits for an already-fired callback to settle", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const callbackStarted = deferred();
        const releaseCallback = deferred();
        const callbackFinished = deferred();
        const fakeWatcher = new FSWatcher();
        fakeWatcher.close = mock(() => Promise.resolve());
        installWatcher(fakeWatcher);
        const watcher = new FileWatcher({
          syncPath: "/tmp/file-watcher-callback",
          watchInterval: 100,
          logger: createSilentLogger("file-watcher-callback"),
          clock,
          onFileChange: async (): Promise<void> => {
            callbackStarted.resolve();
            await releaseCallback.promise;
            callbackFinished.resolve();
          },
        });

        yield* Effect.promise(() => startWatcher(watcher, fakeWatcher));
        fakeWatcher.emit("change", "/tmp/file-watcher-callback/note.md");
        yield* TestClock.adjust(500);
        yield* Effect.promise(() => callbackStarted.promise);

        const stopping = watcher.stop();
        let stopSettled = false;
        void stopping.then(() => {
          stopSettled = true;
        });
        yield* Effect.yieldNow();
        expect(stopSettled).toBe(false);

        releaseCallback.resolve();
        yield* Effect.promise(() => stopping);
        expect(stopSettled).toBe(true);
        yield* Effect.promise(() => callbackFinished.promise);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("restarts the trailing batch delay after another file event", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const onFileChange = mock(async (): Promise<void> => {});
        const fakeWatcher = new FSWatcher();
        fakeWatcher.close = mock(() => Promise.resolve());
        installWatcher(fakeWatcher);
        const watcher = new FileWatcher({
          syncPath: "/tmp/file-watcher-trailing",
          watchInterval: 100,
          logger: createSilentLogger("file-watcher-trailing"),
          clock,
          onFileChange,
        });

        yield* Effect.promise(() => startWatcher(watcher, fakeWatcher));
        fakeWatcher.emit("change", "/tmp/file-watcher-trailing/one.md");
        yield* TestClock.adjust(400);
        fakeWatcher.emit("change", "/tmp/file-watcher-trailing/two.md");
        yield* TestClock.adjust(499);
        yield* Effect.yieldNow();
        expect(onFileChange).not.toHaveBeenCalled();

        yield* TestClock.adjust(1);
        yield* Effect.yieldNow();
        expect(onFileChange).toHaveBeenCalledTimes(2);
        yield* Effect.promise(() => watcher.stop());
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });

  it("interrupts a pending batch delay during stop", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* TestClock.testClock();
        const onFileChange = mock(async (): Promise<void> => {});
        const fakeWatcher = new FSWatcher();
        fakeWatcher.close = mock(() => Promise.resolve());
        installWatcher(fakeWatcher);
        const watcher = new FileWatcher({
          syncPath: "/tmp/file-watcher-pending",
          watchInterval: 100,
          logger: createSilentLogger("file-watcher-pending"),
          clock,
          onFileChange,
        });

        yield* Effect.promise(() => startWatcher(watcher, fakeWatcher));
        fakeWatcher.emit("change", "/tmp/file-watcher-pending/note.md");
        yield* TestClock.adjust(499);
        expect(onFileChange).not.toHaveBeenCalled();

        yield* Effect.promise(() => watcher.stop());
        yield* TestClock.adjust(1);
        yield* Effect.yieldNow();
        expect(onFileChange).not.toHaveBeenCalled();
      }).pipe(Effect.provide(TestContext.TestContext)),
    );
  });
});
