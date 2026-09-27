import * as stylex from "@stylexjs/stylex";
export const groupingMembershipStyles: Record<
  | "frame"
  | "select"
  | "slot"
  | "input"
  | "help"
  | "helpText"
  | "suggestions"
  | "count",
  stylex.StyleXStyles
> = stylex.create({
  count: {
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    borderInlineStart: "1px solid var(--console-rule-strong)",
    paddingInlineStart: 6,
  },
  frame: {
    border: "1px solid var(--console-rule-strong)",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "var(--console-card-soft)",
    minWidth: 0,
  },
  select: {
    flex: "1 1 120px",
    width: "auto",
    minWidth: 120,
    maxWidth: "100%",
    minHeight: 32,
    fontSize: { default: 12, "@media (max-width: 640px)": 16 },
  },
  slot: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flex: "1 1 150px",
    minWidth: 0,
    maxWidth: "100%",
  },
  input: { flex: 1, minWidth: 90, width: 110 },
  helpText: { color: "var(--console-text-dim)" },
  help: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
});
