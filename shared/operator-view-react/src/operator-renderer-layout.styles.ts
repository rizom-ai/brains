import * as stylex from "@stylexjs/stylex";
export const rendererLayoutStyles: Record<
  | "head"
  | "copy"
  | "title"
  | "kicker"
  | "description"
  | "standing"
  | "status"
  | "statusDetail"
  | "control"
  | "message"
  | "error"
  | "empty"
  | "links"
  | "cell",
  stylex.StyleXStyles
> & {
  caption: stylex.StyleXStyles<Record<string, string | number | null>>;
  matrix: (columns: number) => stylex.StyleXStyles;
} = stylex.create({
  head: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px 28px",
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-text)",
    minWidth: 0,
  },
  copy: { maxWidth: "46ch", minWidth: 0 },
  title: {
    margin: 0,
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: { default: 34, "@media (max-width: 900px)": 27 },
    fontVariationSettings: '"SOFT" 70, "opsz" 60',
    fontWeight: 580,
    letterSpacing: "-.01em",
    lineHeight: 1.05,
    overflowWrap: "anywhere",
  },
  kicker: {
    display: "block",
    marginBottom: 6,
    color: "var(--console-accent)",
    fontFamily: "var(--console-mono)",
    fontSize: 9,
    letterSpacing: ".18em",
    textTransform: "uppercase",
    overflowWrap: "anywhere",
  },
  description: {
    marginTop: 7,
    color: "var(--console-text-dim)",
    fontSize: 13,
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  standing: {
    display: "grid",
    justifyItems: "end",
    gap: 12,
    minWidth: 0,
    maxWidth: "100%",
  },
  status: {
    display: "grid",
    justifyItems: "end",
    gap: 3,
    color: {
      default: "var(--console-text)",
      ':is([data-tone="good"])': "var(--console-ok)",
      ':is([data-tone="warn"])': "var(--console-warn)",
      ':is([data-tone="error"])': "var(--console-err)",
    },
    fontSize: 12.5,
    fontWeight: 550,
    overflowWrap: "anywhere",
  },
  statusDetail: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 9.5,
    fontWeight: 400,
    overflowWrap: "anywhere",
  },
  control: {
    display: "inline-grid",
    alignItems: "start",
    gap: 8,
    minWidth: 0,
    maxWidth: "100%",
  },
  message: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: 10,
    overflowWrap: "anywhere",
  },
  error: { color: "var(--console-err)" },
  empty: {
    margin: 0,
    padding: "18px 0",
    color: "var(--console-text-muted)",
    fontSize: 12.5,
    overflowWrap: "anywhere",
  },
  links: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: {
      default: 7,
      ":is([data-operator-blocks] > [data-block=links] *)": 18,
      ":is([data-operator-detail-pane] *)": 16,
    },
    fontSize: {
      default: null,
      ":is([data-operator-blocks] > [data-block=links] *)": 12.5,
    },
    minWidth: 0,
  },
  matrix: (columns: number) => ({
    display: "grid",
    gap: 18,
    minWidth: 0,
    gridTemplateColumns: {
      default: `repeat(${columns}, minmax(0, 1fr))`,
      "@media (max-width: 720px)": "minmax(0, 1fr)",
    },
  }),
  cell: {
    minWidth: 0,
    padding: "14px 16px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    borderTopWidth: 2,
    borderTopColor: {
      default: "var(--console-text-muted)",
      ':is([data-tone="good"])': "var(--console-ok)",
      ':is([data-tone="warn"])': "var(--console-warn)",
      ':is([data-tone="error"])': "var(--console-err)",
    },
    borderRadius: 8,
    backgroundColor: "var(--console-card)",
  },
  caption: {
    margin: "0 0 11px",
    color: "var(--console-text-muted)",
    fontFamily: "var(--operator-section-family, var(--console-mono))",
    fontSize: "var(--operator-section-size, 9.5px)",
    fontWeight: "var(--operator-section-weight, 500)",
    letterSpacing: "var(--operator-section-spacing, .16em)",
    textTransform: "var(--operator-section-transform, uppercase)",
    overflowWrap: "anywhere",
  },
});
