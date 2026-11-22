import { describe, expect, it } from "bun:test";
import { emptyState } from "../src/engine";
import { acceptConnect } from "../src/obsidian/connect";
import {
  addressKey,
  parsePluginData,
  stateFor,
  withState,
} from "../src/obsidian/settings";

describe("the sync state belongs to one brain", () => {
  it("names a brain the same way however its address is typed", () => {
    expect(addressKey("brain.example")).toBe("https://brain.example/dav/");
    expect(addressKey("https://brain.example/")).toBe(
      "https://brain.example/dav/",
    );
    expect(addressKey(" https://brain.example/dav ")).toBe(
      "https://brain.example/dav/",
    );
    expect(addressKey("")).toBe("");
    expect(addressKey("not a :: url")).toBe("");
  });

  it("keeps each brain's state while the address is edited and back", () => {
    const synced = {
      ...emptyState("https://brain.example/dav/"),
      initialized: true,
    };
    const data = withState(
      parsePluginData({}),
      "https://brain.example/dav/",
      synced,
    );

    // One letter typed, then removed: a different brain for a moment.
    expect(stateFor(data, "brain.exampl").initialized).toBe(false);
    expect(stateFor(data, "brain.example").initialized).toBe(true);
    expect(
      stateFor(
        parsePluginData(JSON.parse(JSON.stringify(data))),
        "brain.example",
      ).initialized,
    ).toBe(true);
  });
});

describe("a Connect answer", () => {
  const pending = {
    state: "ab12cd34ef56ab12",
    origin: "https://brain.example",
  };
  const answer = {
    action: "brain-sync",
    state: "ab12cd34ef56ab12",
    username: "dav-k3x9",
    password: "secret",
  };

  it("is taken when it answers this vault's request for the brain it names", () => {
    expect(acceptConnect(pending, answer, "brain.example")).toEqual({
      username: "dav-k3x9",
      password: "secret",
    });
  });

  it("is ignored when no request is open, or the state is another", () => {
    expect(acceptConnect(undefined, answer, "brain.example")).toBeUndefined();
    expect(
      acceptConnect(pending, { ...answer, state: "forged" }, "brain.example"),
    ).toBeUndefined();
    expect(
      acceptConnect(
        pending,
        { ...answer, password: undefined },
        "brain.example",
      ),
    ).toBeUndefined();
  });

  it("is ignored when the address changed since Connect opened the brain", () => {
    expect(acceptConnect(pending, answer, "other.example")).toBeUndefined();
  });
});
