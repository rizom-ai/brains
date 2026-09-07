import { describe, expect, it } from "bun:test";
import { installDomGlobals, installGlobals } from "../src";

interface Probe {
  readonly marker: string;
}

function reader(name: string): unknown {
  return Reflect.get(globalThis, name);
}

describe("installGlobals", () => {
  it("installs each value and puts back what was there", () => {
    const original = reader("navigator");

    const restore = installGlobals({ navigator: { marker: "installed" } });
    expect(reader("navigator")).toEqual({ marker: "installed" });

    restore();
    expect(reader("navigator")).toBe(original);
  });

  it("removes a name that did not exist rather than leaving it undefined", () => {
    expect("brainsTestOnlyName" in globalThis).toBe(false);

    const restore = installGlobals({ brainsTestOnlyName: 1 });
    expect("brainsTestOnlyName" in globalThis).toBe(true);

    restore();
    expect("brainsTestOnlyName" in globalThis).toBe(false);
  });

  it("restores the value from before the first install, not the one between", () => {
    const outer = installGlobals({ brainsTestOnlyName: "outer" });
    const inner = installGlobals({ brainsTestOnlyName: "inner" });

    inner();
    expect(reader("brainsTestOnlyName")).toBe("outer");
    outer();
    expect("brainsTestOnlyName" in globalThis).toBe(false);
  });
});

describe("installDomGlobals", () => {
  const windowDouble = {
    document: { marker: "document" },
    navigator: { marker: "navigator" },
    HTMLElement: { marker: "HTMLElement" },
    Element: { marker: "Element" },
    Node: { marker: "Node" },
  };

  it("installs the names a React DOM test needs from one window", () => {
    const restore = installDomGlobals(windowDouble);

    expect(reader("window")).toBe(windowDouble);
    expect(reader("document")).toBe(windowDouble.document);
    expect(reader("navigator")).toBe(windowDouble.navigator);
    expect(reader("HTMLElement")).toBe(windowDouble.HTMLElement);
    expect(reader("Element")).toBe(windowDouble.Element);
    expect(reader("Node")).toBe(windowDouble.Node);
    expect(reader("IS_REACT_ACT_ENVIRONMENT")).toBe(true);

    restore();
  });

  it("installs the extras a test asks for alongside the core", () => {
    const observer: Probe = { marker: "ResizeObserver" };

    const restore = installDomGlobals(windowDouble, {
      ResizeObserver: observer,
    });
    expect(reader("ResizeObserver")).toBe(observer);

    restore();
    expect("ResizeObserver" in globalThis).toBe(
      Object.hasOwn(globalThis, "ResizeObserver"),
    );
  });

  it("puts every name back, so one test file cannot change another's globals", () => {
    const before = ["window", "document", "navigator", "Element"].map(reader);

    installDomGlobals(windowDouble, { ResizeObserver: {} })();

    expect(["window", "document", "navigator", "Element"].map(reader)).toEqual(
      before,
    );
  });
});
