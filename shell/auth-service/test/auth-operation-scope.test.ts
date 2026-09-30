import { describe, expect, it, mock } from "bun:test";
import { deferred } from "@brains/utils/deferred";
import { AuthOperationScope } from "../src/auth-operation-scope";

describe("AuthOperationScope", () => {
  it("joins matching closes and orders work across multiple lifetimes", async () => {
    const owner = new AuthOperationScope();
    const entered = deferred();
    const release = deferred();
    const events: string[] = [];
    const first = owner.run(async () => {
      entered.resolve();
      await release.promise;
      events.push("first");
    });
    await entered.promise;
    const closeFirst = owner.close(async () => {
      events.push("close-first");
    });
    expect(
      owner.close(async () => {
        throw new Error("Duplicate close");
      }),
    ).toBe(closeFirst);
    const second = owner.run(async () => {
      events.push("second");
    });
    const closeSecond = owner.close(async () => {
      events.push("close-second");
    });
    expect(closeSecond).not.toBe(closeFirst);
    release.resolve();
    await Promise.all([first, closeFirst, second, closeSecond]);
    expect(events).toEqual(["first", "close-first", "second", "close-second"]);
  });

  it("drains nested work admitted after close's snapshot, even if its parent does not await it", async () => {
    const owner = new AuthOperationScope();
    const parentEntered = deferred();
    const releaseParent = deferred();
    const childEntered = deferred();
    const releaseChild = deferred();
    let child: Promise<string> | undefined;
    const parent = owner.run(async () => {
      parentEntered.resolve();
      await releaseParent.promise;
      child = owner.run(async () => {
        childEntered.resolve();
        await releaseChild.promise;
        return "child";
      });
      return "parent";
    });
    await parentEntered.promise;
    let closed = false;
    const closing = owner.close(async () => {
      closed = true;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      releaseParent.resolve();
      await childEntered.promise;
      expect(await parent).toBe("parent");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(closed).toBe(false);
    } finally {
      releaseParent.resolve();
      releaseChild.resolve();
      await Promise.allSettled([parent, closing]);
    }
    expect(await child).toBe("child");
    expect(closed).toBe(true);
  });

  it("does not let detached continuations reuse a completed parent's admission", async () => {
    const owner = new AuthOperationScope();
    const trigger = deferred();
    const closeEntered = deferred();
    const releaseClose = deferred();
    let later: Promise<string> | undefined;
    let laterEntered = false;
    await owner.run(async () => {
      later = (async (): Promise<string> => {
        await trigger.promise;
        return owner.run(async () => {
          laterEntered = true;
          return "later";
        });
      })();
    });
    const closing = owner.close(async () => {
      closeEntered.resolve();
      await releaseClose.promise;
    });
    await closeEntered.promise;
    trigger.resolve();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(laterEntered).toBe(false);
    } finally {
      releaseClose.resolve();
      await closing;
    }
    expect(await later).toBe("later");
    expect(laterEntered).toBe(true);
  });

  it("closes background admission immediately and reopens it only for a later lifetime", async () => {
    const owner = new AuthOperationScope();
    const entered = deferred();
    const release = deferred();
    const active = owner.runBackground(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let closed = false;
    const closing = owner.close(async () => {
      closed = true;
    });
    const scheduled = mock(async (): Promise<void> => {});
    try {
      await owner.runBackground(scheduled);
      expect(scheduled).not.toHaveBeenCalled();
      expect(closed).toBe(false);
    } finally {
      release.resolve();
      await Promise.all([active, closing]);
    }
    await owner.runBackground(scheduled);
    expect(scheduled).not.toHaveBeenCalled();
    await owner.run(async () => "restart");
    await owner.runBackground(scheduled);
    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  it("does not let scheduled ticks reuse an active startup scope during close", async () => {
    const owner = new AuthOperationScope();
    const entered = deferred();
    const release = deferred();
    const scheduled = mock(async (): Promise<void> => {});
    const startup = owner.run(async () => {
      entered.resolve();
      await release.promise;
      await owner.runBackground(scheduled);
      return "ready";
    });
    await entered.promise;
    const closing = owner.close(async () => {});
    release.resolve();
    expect(await startup).toBe("ready");
    await closing;
    expect(scheduled).not.toHaveBeenCalled();
  });

  it("does not reopen background admission for work queued before another close", async () => {
    const owner = new AuthOperationScope();
    const entered = deferred();
    const release = deferred();
    const active = owner.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const firstClose = owner.close(async () => {});
    const between = owner.run(async () => "between");
    const secondClose = owner.close(async () => {});
    const scheduled = mock(async (): Promise<void> => {});
    release.resolve();
    await between;
    await owner.runBackground(scheduled);
    expect(scheduled).not.toHaveBeenCalled();
    await Promise.all([active, firstClose, secondClose]);
    await owner.run(async () => "restart");
    await owner.runBackground(scheduled);
    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  it("rejects self-close instead of deadlocking its own operation", async () => {
    const owner = new AuthOperationScope();
    const release = mock(async (): Promise<void> => {});
    const error = await owner
      .run(async () => owner.close(release))
      .catch((caught: unknown) => caught);
    expect(error).toEqual(
      new Error("Cannot close auth service from an active auth operation"),
    );
    expect(release).not.toHaveBeenCalled();
    await owner.close(release);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("isolates two owners even when one calls the other during shutdown", async () => {
    const first = new AuthOperationScope();
    const second = new AuthOperationScope();
    const entered = deferred();
    const release = deferred();
    const firstWork = first.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let firstClosed = false;
    const firstClose = first.close(async () => {
      firstClosed = true;
    });
    try {
      await second.run(async () => "second");
      await second.close(async () => {});
      expect(firstClosed).toBe(false);
    } finally {
      release.resolve();
      await Promise.all([firstWork, firstClose]);
    }
    expect(firstClosed).toBe(true);
  });

  it("keeps cleanup failures visible while allowing a later lifetime", async () => {
    const owner = new AuthOperationScope();
    const failure = new Error("Release failed");
    const closing = owner.close(async (): Promise<void> => {
      throw failure;
    });
    expect(owner.close(async () => {})).toBe(closing);
    expect(await closing.catch((error: unknown) => error)).toBe(failure);
    expect(await owner.run(async () => "retry")).toBe("retry");
    let released = false;
    await owner.close(async () => {
      released = true;
    });
    expect(released).toBe(true);
  });

  it("reports synchronous operation failures without poisoning close or later work", async () => {
    const owner = new AuthOperationScope();
    const failure = new Error("Operation failed synchronously");
    const operation = owner.run((): never => {
      throw failure;
    });
    let released = false;
    const closing = owner.close(async () => {
      released = true;
    });
    expect(await operation.catch((error: unknown) => error)).toBe(failure);
    await closing;
    expect(released).toBe(true);
    expect(await owner.run(async () => "next")).toBe("next");
  });
});
