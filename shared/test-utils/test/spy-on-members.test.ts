import { describe, expect, it } from "bun:test";
import { spyOnMembers } from "../src/spy-on-members";

/**
 * The reason this helper's return type matters: tests that need to read a
 * captured argument — a handler passed to `subscribe`, a widget passed to
 * `registerWidget` — reach for `.mock.calls`. When the return type was plain
 * `T`, `.mock` was invisible, and every such test either cast the namespace or
 * replaced it with a hand-written literal behind `as unknown as`. Phase 6 is
 * removing those casts, so the helper has to expose what it records.
 */

interface Namespace {
  greet(name: string): string;
  add(a: number, b: number): number;
  label: string;
}

function createNamespace(): Namespace {
  return {
    greet: (name) => `hello ${name}`,
    add: (a, b) => a + b,
    label: "plain value",
  };
}

describe("spyOnMembers", () => {
  it("keeps the original implementation running", () => {
    const spied = spyOnMembers(createNamespace());

    expect(spied.greet("world")).toBe("hello world");
    expect(spied.add(2, 3)).toBe(5);
  });

  it("passes non-function members through untouched", () => {
    const spied = spyOnMembers(createNamespace());

    expect(spied.label).toBe("plain value");
  });

  it("records calls for assertion", () => {
    const spied = spyOnMembers(createNamespace());

    spied.greet("world");

    expect(spied.greet).toHaveBeenCalledWith("world");
  });

  it("exposes captured arguments without a cast", () => {
    const spied = spyOnMembers(createNamespace());

    spied.add(4, 5);
    spied.add(6, 7);

    // The property this test exists for: reading an argument back, typed,
    // straight off the spy.
    expect(spied.add.mock.calls).toHaveLength(2);
    const [first] = spied.add.mock.calls;
    expect(first?.[0]).toBe(4);
    expect(first?.[1]).toBe(5);
  });

  it("stays assignable to the namespace it wrapped", () => {
    // The spied namespace must still satisfy the original interface, or the
    // context factories could not return it where the real type is expected.
    const spied: Namespace = spyOnMembers(createNamespace());

    expect(spied.greet("there")).toBe("hello there");
  });
});
