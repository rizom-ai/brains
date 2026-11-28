import * as stylex from "@stylexjs/stylex";

/** The tab bar's height above the device's safe area. */
const BAR_HEIGHT = "64px";

/**
 * On a phone the five sections are a tab bar along the bottom, as in the
 * phone mockup; a section's other pages open in a short sheet above it.
 */
export const tabBarStyles: Record<
  | "bar"
  | "tab"
  | "active"
  | "icon"
  | "light"
  | "space"
  | "overlay"
  | "sheet"
  | "sheetHead"
  | "sheetTitle"
  | "sheetList"
  | "option"
  | "optionActive"
  | "optionCount"
  | "optionAttention",
  stylex.StyleXStyles
> = stylex.create({
  bar: {
    display: { default: "none", "@media (max-width: 900px)": "flex" },
    position: "fixed",
    insetInline: 0,
    bottom: 0,
    zIndex: 50,
    justifyContent: "space-around",
    alignItems: "flex-start",
    height: `calc(${BAR_HEIGHT} + env(safe-area-inset-bottom))`,
    paddingTop: 8,
    paddingBottom: "env(safe-area-inset-bottom)",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule)",
    backgroundColor: "var(--console-card-soft)",
    fontFamily: "var(--console-ui)",
  },
  tab: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    minWidth: "var(--console-touch)",
    minHeight: "var(--console-touch)",
    paddingInline: 6,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: 11,
    cursor: "pointer",
    textDecoration: "none",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: "var(--console-accent)",
    outlineOffset: -2,
    borderRadius: 8,
  },
  active: { color: "var(--console-accent-text)", fontWeight: 600 },
  icon: { display: "block" },
  light: {
    position: "absolute",
    top: -1,
    insetInlineEnd: 4,
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "var(--console-accent)",
  },
  // Each page frame keeps its bottom clear of the bar while the bar shows.
  space: {
    paddingBottom: {
      default: null,
      ":has([data-studio-tab-bar])": {
        default: null,
        "@media (max-width: 900px)": `calc(${BAR_HEIGHT} + env(safe-area-inset-bottom))`,
      },
    },
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 58,
    backgroundColor:
      "color-mix(in srgb, var(--console-frame) 55%, transparent)",
  },
  sheet: {
    position: "fixed",
    insetInline: 0,
    bottom: `calc(${BAR_HEIGHT} + env(safe-area-inset-bottom))`,
    zIndex: 59,
    maxHeight: "70dvh",
    display: "flex",
    flexDirection: "column",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--console-rule-strong)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: "var(--console-card)",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    outlineStyle: "none",
  },
  sheetHead: {
    paddingBlock: 14,
    paddingInline: 20,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
  },
  sheetTitle: { margin: 0, fontSize: 15, fontWeight: 600 },
  sheetList: {
    overflowY: "auto",
    overscrollBehavior: "contain",
    margin: 0,
    paddingBlock: 6,
    paddingInline: 8,
    listStyle: "none",
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: "var(--console-touch)",
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: "transparent",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: 15,
    textAlign: "start",
    textDecoration: "none",
    cursor: "pointer",
  },
  optionActive: {
    backgroundColor: "var(--console-accent-soft)",
    fontWeight: 600,
  },
  optionCount: {
    marginInlineStart: "auto",
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    color: "var(--console-text)",
  },
  optionAttention: { color: "var(--console-accent-text)" },
});
