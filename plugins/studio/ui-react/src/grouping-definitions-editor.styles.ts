import * as stylex from "@stylexjs/stylex";
export const groupingDefinitionsEditorStyles: Record<
  | "intro"
  | "help"
  | "grid"
  | "choices"
  | "choice"
  | "readOnly"
  | "first"
  | "actions"
  | "exclusions"
  | "exclusionsSummary"
  | "rule",
  stylex.StyleXStyles
> = stylex.create({
  intro: {
    color: "var(--console-text-dim)",
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 24,
    maxWidth: "78ch",
  },
  help: { color: "var(--console-text-dim)" },
  grid: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2,minmax(0,1fr))",
      "@media (max-width: 640px)": "minmax(0,1fr)",
    },
    gap: "14px 24px",
    marginBlock: 18,
    minWidth: 0,
  },
  choices: { padding: 0, margin: 0, borderWidth: 0, minWidth: 0 },
  choice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: { default: 36, "@media (max-width: 640px)": 44 },
    overflowWrap: "anywhere",
  },
  readOnly: {
    display: "block",
    padding: "8px 10px",
    border: "1px dashed var(--console-rule-strong)",
    borderRadius: 6,
    backgroundColor: "var(--console-card-soft)",
    fontFamily: "var(--console-mono)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  first: { paddingBlock: "38px 50px", maxWidth: "52ch" },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 18,
  },
  exclusions: { marginBottom: 12 },
  exclusionsSummary: {
    display: "list-item",
    listStylePosition: "inside",
    cursor: "pointer",
    minHeight: 44,
    paddingBlock: 12,
  },
  rule: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 18px",
    marginBottom: 12,
  },
});
