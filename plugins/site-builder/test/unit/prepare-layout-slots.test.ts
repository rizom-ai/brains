import { describe, expect, it } from "bun:test";
import { UISlotRegistry } from "@brains/site-engine";
import { SdkError } from "@brains/sdk/services";
import { caughtError } from "@brains/test-utils";
import { createElement, useId } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareLayoutSlots } from "../../src/lib/prepare-layout-slots";

describe("static layout snapshots", () => {
  it("isolates React ids, retains priority/ties and freezes multiple named slots", () => {
    const source = new UISlotRegistry();
    const Component = (): ReturnType<typeof createElement> =>
      createElement("p", { id: useId() }, "signup");
    source.register("footer-top", {
      pluginId: "first",
      render: () => createElement(Component),
    });
    source.register("footer-top", {
      pluginId: "second",
      render: () => createElement(Component),
    });
    source.register("header", {
      pluginId: "high",
      priority: 100,
      render: () => null,
    });
    const snapshot = prepareLayoutSlots(source, new AbortController().signal);
    const again = prepareLayoutSlots(source, new AbortController().signal);
    expect(snapshot.content).toEqual(again.content);
    expect(snapshot.slots.getSlotNames()).toEqual(["footer-top", "header"]);
    expect(
      snapshot.content
        .filter((entry) => entry.slotName === "footer-top")
        .map((entry) => entry.pluginId),
    ).toEqual(["first", "second"]);
    expect(snapshot.content[0]?.html).not.toBe(snapshot.content[1]?.html);
    expect(snapshot.slots.getSlot("header")[0]?.render()).toBeNull();
    expect(Object.isFrozen(snapshot.content)).toBe(true);
    expect(Object.isFrozen(snapshot.slots.getSlot("footer-top")[0])).toBe(true);
    const entry = snapshot.slots.getSlot("footer-top")[0];
    expect(renderToStaticMarkup(entry?.render())).toContain(
      snapshot.content[0]?.html ?? "missing",
    );
    snapshot.dispose();
    again.dispose();
    expect(() => entry?.render()).toThrow(SdkError);
  });

  it("rejects malformed render results instead of accepting arbitrary React nodes", () => {
    const source = new UISlotRegistry();
    Reflect.apply(source.register, source, [
      "footer-top",
      { pluginId: "invalid", render: (): number => 42 },
    ]);
    expect(() =>
      prepareLayoutSlots(source, new AbortController().signal),
    ).toThrow(SdkError);
  });

  it("keeps nested component failures local and exposes only a coded error", async () => {
    const source = new UISlotRegistry();
    const original = new Error("private component diagnostic");
    const Component = (): never => {
      throw original;
    };
    source.register("footer-top", {
      pluginId: "broken",
      render: () => createElement(Component),
    });
    const error = await Promise.resolve()
      .then(() => prepareLayoutSlots(source, new AbortController().signal))
      .catch(caughtError);
    expect(error).toMatchObject({ code: "handler_failed", cause: original });
    expect(JSON.stringify(error)).not.toContain("private component diagnostic");
  });

  it("refuses pre-aborted and mid-render cancelled snapshots", () => {
    const source = new UISlotRegistry();
    const abort = new AbortController();
    let calls = 0;
    source.register("footer-top", {
      pluginId: "cancel",
      render: () => {
        calls++;
        abort.abort();
        return null;
      },
    });
    expect(() => prepareLayoutSlots(source, AbortSignal.abort())).toThrow(
      SdkError,
    );
    expect(calls).toBe(0);
    expect(() => prepareLayoutSlots(source, abort.signal)).toThrow(SdkError);
    expect(calls).toBe(1);
  });
});
