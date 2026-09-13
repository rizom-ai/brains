import * as stylex from "@stylexjs/stylex";

/**
 * One search field for every Studio collection: the library and the Chat
 * session index share this so a query looks and behaves the same in both.
 * The field carries its own glyph and clear control instead of a separate
 * label line and submit button.
 */
export const searchStyles: Record<
  "field" | "wide" | "glyph" | "input" | "roomy" | "clear",
  stylex.StyleXStyles
> = stylex.create({
  field: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flex: "1 1 auto",
    minWidth: 0,
  },
  // The library sits in a wide pane; a query is short, so the field is not.
  wide: { maxWidth: 360 },
  glyph: {
    position: "absolute",
    insetInlineStart: 10,
    width: 14,
    height: 14,
    color: "var(--console-text-muted)",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    minHeight: { default: 38, "@media (max-width: 640px)": 44 },
    paddingInlineStart: 31,
    paddingInlineEnd: 12,
    fontSize: { default: 13, "@media (max-width: 640px)": 16 },
    // The field supplies its own clear control in every browser.
    "::-webkit-search-cancel-button": { display: "none" },
  },
  // Space for the clear control is reserved only while it is there, so a
  // narrow rail spends none of its width on an absent button.
  roomy: { paddingInlineEnd: 34 },
  clear: {
    position: "absolute",
    insetInlineEnd: 4,
    display: "grid",
    width: { default: 28, "@media (max-width: 640px)": 40 },
    height: { default: 28, "@media (max-width: 640px)": 40 },
    minHeight: { default: 28, "@media (max-width: 640px)": 40 },
    padding: 0,
    placeItems: "center",
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--console-rule)",
    },
    color: {
      default: "var(--console-text-muted)",
      ":hover": "var(--console-text)",
    },
    fontFamily: "var(--console-mono)",
    fontSize: 14,
  },
});
