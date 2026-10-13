import { describe, expect, test } from "bun:test";
import { ASK_ROOM_STYLES } from "../src/templates/ask-room-styles";

describe("the Ask room's styles", () => {
  test("scroll the column within the screen on a wide screen only, and let the conversation grow in it", () => {
    const wide =
      ASK_ROOM_STYLES.split("@media not all and (max-width: 60rem)")[1] ?? "";
    expect(wide).toMatch(
      /\[data-ask-column\] \{[^}]*max-height: calc\(100svh - var\(--ask-column-clear, 4\.5rem\)\);[^}]*overflow-y: auto;[^}]*scrollbar-width: thin;/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /\[data-ask-room\] \.brain-guest-box:not\(\.is-sheet\) > \.brain-box-scroll \{[^}]*max-height: none;[^}]*overflow: visible;/,
    );
  });

  test("draw leads only where a wide, moving screen shows them, and flash a source brought into view", () => {
    expect(ASK_ROOM_STYLES).toMatch(
      /\[data-ask-leads\] path \{[^}]*stroke: var\(--color-accent\);/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /@media \(max-width: 60rem\) \{\s*\[data-ask-leads\] \{\s*display: none;/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /\[data-ask-source\]\[data-ask-flash\] \{\s*animation: ask-flash/,
    );
    expect(ASK_ROOM_STYLES).toMatch(
      /prefers-reduced-motion[^]*\[data-ask-source\]\[data-ask-flash\] \{\s*animation: none;/,
    );
  });
});
