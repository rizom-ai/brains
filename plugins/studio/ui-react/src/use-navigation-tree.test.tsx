/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { StudioWorkspaceInfo } from "./api";
import {
  useNavigationTree,
  type NavigationTree,
  type NavigationTreeInput,
} from "./use-navigation-tree";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance, {
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function workspace(id: string): StudioWorkspaceInfo {
  return {
    id,
    pluginId: "studio",
    label: id,
    rendererName: "StudioChatWorkspace",
    priority: 1,
    permission: "trusted",
    entityTypes: [],
  };
}

const chat = workspace("web-chat:chat");

interface Harness {
  tree: () => NavigationTree;
  selected: string[];
  render: (input: Partial<NavigationTreeInput>) => Promise<void>;
}

async function renderTree(
  initial: Partial<NavigationTreeInput> = {},
): Promise<Harness> {
  let latest: NavigationTree | undefined;
  const selected: string[] = [];

  function Probe(props: { input: Partial<NavigationTreeInput> }): null {
    latest = useNavigationTree({
      currentArea: "library",
      destination: "note",
      activeWorkspace: null,
      areaWorkspaces: [chat],
      onSelectWorkspace: (id): void => {
        selected.push(id);
      },
      ...props.input,
    });
    return null;
  }

  const harness: Harness = {
    tree: (): NavigationTree => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
    selected,
    render: async (input): Promise<void> => {
      await act(async () => {
        root.render(createElement(Probe, { input }));
      });
    },
  };
  await harness.render(initial);
  return harness;
}

describe("useNavigationTree", () => {
  it("shows the area the current destination belongs to", async () => {
    const harness = await renderTree({ currentArea: "work" });

    expect(harness.tree().activeArea).toBe("work");
  });

  it("browses an area without navigating", async () => {
    const harness = await renderTree({ currentArea: "library" });

    await act(async () => harness.tree().selectArea("system"));

    expect(harness.tree().activeArea).toBe("system");
    // Browsing must not navigate: an unsaved draft elsewhere survives it.
    expect(harness.selected).toEqual([]);
  });

  it("navigates instead of browsing when the area is a workspace", async () => {
    const harness = await renderTree({ currentArea: "library" });

    await act(async () => harness.tree().selectArea("chat"));

    expect(harness.selected).toEqual(["web-chat:chat"]);
  });

  it("stops browsing rather than renavigating to where it already is", async () => {
    const harness = await renderTree({
      currentArea: "chat",
      activeWorkspace: "web-chat:chat",
    });
    await act(async () => harness.tree().selectArea("system"));
    expect(harness.tree().activeArea).toBe("system");

    await act(async () => harness.tree().selectArea("chat"));

    expect(harness.selected).toEqual([]);
    expect(harness.tree().activeArea).toBe("chat");
  });

  it("returns to the destination's own area when the destination changes", async () => {
    // Including Back and Forward, which change the destination without any
    // click on the navigation.
    const harness = await renderTree({ currentArea: "library" });
    await act(async () => harness.tree().selectArea("system"));
    expect(harness.tree().activeArea).toBe("system");

    await harness.render({ currentArea: "work", destination: "task" });

    expect(harness.tree().activeArea).toBe("work");
  });

  it("opens a leaf list only for the areas that have one", async () => {
    for (const area of ["library", "work", "system"] as const) {
      const harness = await renderTree({ currentArea: area });
      expect(harness.tree().leafOpen).toBe(true);
    }
    for (const area of ["overview", "chat", "administration"] as const) {
      const harness = await renderTree({ currentArea: area });
      expect(harness.tree().leafOpen).toBe(false);
    }
  });

  it("remembers which groups are open, and ignores a no-op toggle", async () => {
    const harness = await renderTree({ currentArea: "library" });
    expect(harness.tree().openGroups["library"]).toBe(true);

    await act(async () => harness.tree().toggleGroup("work", true));
    expect(harness.tree().openGroups["work"]).toBe(true);

    const before = harness.tree().openGroups;
    await act(async () => harness.tree().toggleGroup("work", true));
    expect(harness.tree().openGroups).toBe(before);
  });
});
