import { describe, expect, test } from "bun:test";
import site from "../src";

// Layout can't be measured outside a browser, so these pin the phone rules
// that keep the drawing on screen; the iPhone-sized check runs in a real
// browser before each release.
const phone = ((): string => {
  const css = site.themeOverride ?? "";
  const start = css.indexOf("@media (max-width: 859px)");
  if (start < 0) throw new Error("no phone rules");
  return css.slice(start, css.indexOf("@media (prefers-reduced-motion", start));
})();

describe("on a phone", () => {
  test("caps a docked card's height so the drawing keeps the top of the screen", () => {
    expect(phone).toMatch(
      /\.hub-ch:not\(\.hub-ch--open\) \.hub-card:not\(\.hub-card--wide\) \{[^}]*max-height: 56svh;[^}]*overflow-y: auto;/,
    );
  });

  test("shows only the lab phase being read, and leaves the price for wider screens", () => {
    expect(phone).toMatch(
      /\.hub-phases li:not\(\.is-on\) \{ display: none; \}/,
    );
    expect(phone).toMatch(/\.hub-price \{ display: none; \}/);
  });

  test("lets the phases and the holders carry the lab and terms chapters", () => {
    expect(phone).toMatch(
      /\.hub-ch\[data-hub-scene="labs"\] \.hub-text, \.hub-ch\[data-hub-scene="fit"\] \.hub-text \{ display: none; \}/,
    );
  });

  test("shows only the holder that is lit, or all of them while the split flows", () => {
    expect(phone).toMatch(
      /\.hub-holders:not\(\.is-all\) li:has\(> \.hub-holder:not\(\.is-on\)\) \{ display: none; \}/,
    );
  });
});
