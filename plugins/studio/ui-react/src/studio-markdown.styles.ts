import * as stylex from "@stylexjs/stylex";
export const markdownStyles: Record<
  | "heading"
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "emphasis"
  | "quote"
  | "list"
  | "item"
  | "code"
  | "fenced"
  | "assist",
  stylex.StyleXStyles
> = stylex.create({
  heading: {
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 70, "opsz" 90',
    fontWeight: 580,
    letterSpacing: "-.01em",
    lineHeight: 1.12,
    margin: "0 0 18px",
    overflowWrap: "anywhere",
  },
  h1: { fontSize: 30, "@media (max-width: 640px)": { fontSize: 27 } },
  h2: { fontSize: 23, marginTop: 26 },
  h3: { fontSize: 18, marginTop: 22 },
  paragraph: {
    fontSize: 15,
    lineHeight: 1.72,
    color: "var(--console-text)",
    marginBottom: 14,
    maxWidth: "62ch",
  },
  emphasis: {
    fontFamily: { default: null, ":is(p *)": "var(--console-display)" },
    fontStyle: "italic",
  },
  quote: {
    borderLeft: "2px solid var(--console-accent)",
    padding: "2px 0 2px 18px",
    margin: "18px 0",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-display)",
    fontStyle: "italic",
    fontSize: 16.5,
  },
  list: { paddingLeft: 22, marginBottom: 14 },
  item: { fontSize: 15, lineHeight: 1.72 },
  code: {
    fontFamily: "var(--console-mono)",
    fontSize: 12.5,
    backgroundColor: "color-mix(in srgb, var(--console-text) 6%, transparent)",
    padding: "1px 5px",
    borderRadius: 4,
  },
  // Streamdown forwards a fenced code's class to its body and pre. Target only
  // the native pre while retaining the library's controls and token rendering.
  fenced: {
    fontFamily: { default: null, ":is(pre)": "var(--console-mono)" },
    fontSize: { default: null, ":is(pre)": 12.5 },
    backgroundColor: { default: null, ":is(pre)": "var(--console-text)" },
    color: { default: null, ":is(pre)": "var(--console-frame)" },
    borderRadius: { default: null, ":is(pre)": 8 },
    padding: { default: null, ":is(pre)": "14px 16px" },
    marginBottom: { default: null, ":is(pre)": 16 },
    overflowX: { default: null, ":is(pre)": "auto" },
  },
  assist: { marginBottom: 6 },
});
