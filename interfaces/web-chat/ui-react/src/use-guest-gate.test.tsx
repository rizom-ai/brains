/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { useGuestGate, type GuestGate } from "./use-guest-gate";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/ask" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

async function renderGate(): Promise<() => GuestGate> {
  let latest: GuestGate | undefined;
  function Probe(): null {
    latest = useGuestGate();
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  return (): GuestGate => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("useGuestGate", () => {
  it("starts held, because the session is not open yet", async () => {
    const gate = await renderGate();

    expect(gate().busy).toBe(true);

    let ran = false;
    await act(async () => {
      await gate().run(async () => {
        ran = true;
      });
    });

    expect(ran).toBe(false);
  });

  it("hands over from the boot run, after which work is accepted", async () => {
    const gate = await renderGate();

    await act(async () => {
      await gate().runBoot(async () => undefined);
    });
    expect(gate().busy).toBe(false);

    let ran = false;
    await act(async () => {
      await gate().run(async () => {
        ran = true;
      });
    });

    expect(ran).toBe(true);
  });

  it("refuses a second operation while one holds it", async () => {
    const gate = await renderGate();
    await act(async () => {
      await gate().runBoot(async () => undefined);
    });

    const held = deferred();
    let first: Promise<void> | undefined;
    await act(async () => {
      first = gate().run(async () => held.promise);
    });
    expect(gate().busy).toBe(true);

    let second = false;
    await act(async () => {
      await gate().run(async () => {
        second = true;
      });
    });
    expect(second).toBe(false);

    await act(async () => {
      held.release();
      await first;
    });
    expect(gate().busy).toBe(false);
  });

  it("releases when the operation throws, so the page is not stuck", async () => {
    const gate = await renderGate();
    await act(async () => {
      await gate().runBoot(async () => undefined);
    });

    await act(async () => {
      await gate().run(async () => {
        throw new Error("Transport unavailable");
      });
    });

    expect(gate().busy).toBe(false);

    let ran = false;
    await act(async () => {
      await gate().run(async () => {
        ran = true;
      });
    });
    expect(ran).toBe(true);
  });

  it("swallows nothing: the caller still sees what its own work threw", async () => {
    const gate = await renderGate();
    await act(async () => {
      await gate().runBoot(async () => undefined);
    });

    let seen: unknown;
    await act(async () => {
      await gate().run(
        async () => {
          throw new Error("Transport unavailable");
        },
        (cause) => {
          seen = cause;
        },
      );
    });

    expect(seen).toBeInstanceOf(Error);
  });

  it("reports that it is held, for operations that must ask before acting", async () => {
    const gate = await renderGate();
    expect(gate().locked()).toBe(true);

    await act(async () => {
      await gate().runBoot(async () => undefined);
    });
    expect(gate().locked()).toBe(false);

    const held = deferred();
    let first: Promise<void> | undefined;
    await act(async () => {
      first = gate().run(async () => held.promise);
    });
    expect(gate().locked()).toBe(true);

    await act(async () => {
      held.release();
      await first;
    });
    expect(gate().locked()).toBe(false);
  });

  it("carries the visitor-facing status and box state", async () => {
    const gate = await renderGate();

    await act(async () => {
      gate().setStatus("Ready.");
      gate().setBoxState("ready");
      gate().setBoxNotice("Nothing was sent.");
    });

    expect(gate().status).toBe("Ready.");
    expect(gate().boxState).toBe("ready");
    expect(gate().boxNotice).toBe("Nothing was sent.");
  });
});
