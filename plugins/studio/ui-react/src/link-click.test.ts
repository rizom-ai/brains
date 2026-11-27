import { describe, expect, it } from "bun:test";
import { isPlainLinkClick } from "./link-click";

const plain = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

describe("isPlainLinkClick", () => {
  it("is a plain primary click Studio handles in place", () => {
    expect(isPlainLinkClick(plain)).toBe(true);
  });

  it("leaves modified and non-primary clicks to the browser", () => {
    expect(isPlainLinkClick({ ...plain, metaKey: true })).toBe(false);
    expect(isPlainLinkClick({ ...plain, ctrlKey: true })).toBe(false);
    expect(isPlainLinkClick({ ...plain, shiftKey: true })).toBe(false);
    expect(isPlainLinkClick({ ...plain, altKey: true })).toBe(false);
    expect(isPlainLinkClick({ ...plain, button: 1 })).toBe(false);
  });
});
