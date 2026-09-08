import * as stylex from "@stylexjs/stylex";

export const chromeStyles: Record<
  | "header"
  | "brandLink"
  | "mark"
  | "brandTitle"
  | "accent"
  | "displayAccent"
  | "headerActions"
  | "control"
  | "primary"
  | "secondary"
  | "icon"
  | "desktopOnly"
  | "focus"
  | "masthead"
  | "title"
  | "description"
  | "tabs"
  | "tab"
  | "badge",
  stylex.StyleXStyles
> = stylex.create({
  header: {
    position: "relative",
    zIndex: 3,
    display: "flex",
    minHeight: 66,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    padding: "0 clamp(18px, 4vw, 58px)",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    backgroundColor:
      "color-mix(in srgb, var(--console-frame) 94%, transparent)",
    "@media (max-width: 640px)": {
      minHeight: "calc(58px + env(safe-area-inset-top))",
      padding: "max(4px, env(safe-area-inset-top)) 12px 4px",
      gap: 12,
    },
  },
  brandLink: {
    display: "inline-flex",
    minWidth: 0,
    minHeight: { default: 0, "@media (max-width: 640px)": 44 },
    alignItems: "center",
    gap: { default: 11, "@media (max-width: 640px)": 8 },
    color: "var(--console-text)",
    textDecorationLine: "none",
  },
  mark: {
    display: "grid",
    width: { default: 28, "@media (max-width: 640px)": 26 },
    height: { default: 28, "@media (max-width: 640px)": 26 },
    flex: "0 0 auto",
    placeItems: "center",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-accent)",
    borderRadius: "50%",
    color: "var(--console-accent)",
    fontFamily: "var(--console-display)",
    fontSize: 12,
    fontWeight: 620,
  },
  brandTitle: {
    minWidth: 0,
    overflow: "hidden",
    fontFamily: "var(--console-display)",
    fontSize: { default: 18, "@media (max-width: 640px)": 15 },
    maxWidth: { default: "none", "@media (max-width: 640px)": 145 },
    fontVariationSettings: '"SOFT" 70,"opsz" 48',
    fontWeight: 570,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accent: {
    color: "var(--console-accent)",
    fontStyle: "italic",
    fontWeight: 470,
  },
  displayAccent: { fontVariationSettings: '"SOFT" 100,"opsz" 72' },
  headerActions: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: { default: 8, "@media (max-width: 640px)": 4 },
  },
  control: {
    display: "inline-flex",
    minHeight: { default: 36, "@media (max-width: 640px)": 44 },
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    fontFamily: "var(--console-mono)",
    fontSize: { default: 10, "@media (max-width: 640px)": 9 },
    fontWeight: 600,
    letterSpacing: "0.07em",
    textDecorationLine: "none",
    textTransform: "uppercase",
    ":hover": { transform: "translateY(-1px)" },
  },
  primary: {
    gap: 7,
    padding: { default: "0 15px", "@media (max-width: 640px)": "0 10px" },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-accent)",
    backgroundColor: "var(--console-accent)",
    color: "var(--console-on-accent)",
  },
  secondary: {
    padding: { default: "0 14px", "@media (max-width: 640px)": "0 10px" },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    color: "var(--console-text)",
    ":hover": {
      borderColor: "var(--console-accent)",
      color: "var(--console-accent-dim)",
    },
  },
  icon: {
    width: { default: 36, "@media (max-width: 640px)": 44 },
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    backgroundColor: "transparent",
    color: "var(--console-text-dim)",
    cursor: "pointer",
    ":hover": {
      borderColor: "var(--console-accent)",
      color: "var(--console-accent-dim)",
    },
  },
  desktopOnly: {
    display: { default: "inline-flex", "@media (max-width: 640px)": "none" },
  },
  focus: {
    outlineOffset: 3,
    ":focus-visible": {
      outline: "2px solid var(--console-accent)",
      outlineOffset: 3,
    },
  },
  masthead: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-end",
    gap: 24,
    padding: "26px 26px 0",
    "@media (max-width: 900px)": { flexWrap: "wrap", gap: "12px 24px" },
    "@media (max-width: 640px)": {
      alignItems: "center",
      gap: "8px 12px",
      padding: "18px 14px 0",
    },
  },
  title: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 80,"opsz" 72',
    fontWeight: 560,
    fontSize: {
      default: 38,
      "@media (max-width: 640px)": "clamp(27px, 8.5vw, 36px)",
    },
    lineHeight: { default: 1, "@media (max-width: 640px)": 1.03 },
    letterSpacing: "-0.01em",
    color: "var(--console-text)",
  },
  description: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
    color: "var(--console-text-muted)",
    fontSize: 13.5,
    paddingBottom: { default: 5, "@media (max-width: 640px)": 0 },
    maxWidth: "44ch",
    "@media (max-width: 640px)": {
      order: 3,
      width: "100%",
      maxWidth: "50ch",
      fontSize: 12.5,
    },
  },
  tabs: {
    display: "flex",
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
    padding: {
      default: "18px 26px 0",
      "@media (max-width: 640px)": "12px 14px 0",
    },
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    "@media (max-width: 900px)": {
      flexWrap: "nowrap",
      overflowX: "auto",
      overscrollBehaviorInline: "contain",
      scrollbarWidth: "none",
    },
    "::-webkit-scrollbar": { display: "none" },
  },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    letterSpacing: "0.05em",
    color: "var(--console-text-muted)",
    padding: "9px 16px 11px",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    transform: "translateY(1px)",
    textDecorationLine: "none",
    whiteSpace: "nowrap",
    ":hover": { color: "var(--console-text-dim)" },
    ':is([aria-selected="true"])': {
      color: "var(--console-text)",
      borderBottomColor: "var(--console-accent)",
    },
    "@media (max-width: 640px)": {
      minHeight: "var(--console-touch)",
      marginRight: 18,
      padding: "8px 2px 10px",
      fontSize: 10.5,
    },
  },
  badge: {
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    borderRadius: 999,
    padding: "0 6px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    color: "var(--console-text-muted)",
  },
});
