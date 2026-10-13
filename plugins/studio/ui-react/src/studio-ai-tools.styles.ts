import * as stylex from "@stylexjs/stylex";

type Name =
  | "clients"
  | "client"
  | "clientName"
  | "text"
  | "steps"
  | "fields"
  | "fieldLabel"
  | "fieldValue"
  | "code"
  | "snippet"
  | "snippetCode"
  | "developer"
  | "developerSummary"
  | "developerHint"
  | "developerClients"
  | "field";

export const aiToolsStyles: Record<Name, stylex.StyleXStyles> = stylex.create({
  clients: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: "14px",
    minWidth: 0,
  },
  client: {
    minWidth: 0,
    display: "grid",
    alignContent: "start",
    gap: "10px",
    padding: "16px 18px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: "8px",
    backgroundColor: "var(--console-card)",
  },
  clientName: {
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--console-text)",
  },
  text: {
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
  },
  steps: {
    margin: 0,
    paddingLeft: "20px",
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
    lineHeight: 1.6,
    color: "var(--console-text-muted)",
  },
  fields: {
    display: "grid",
    gridTemplateColumns: "max-content minmax(0, 1fr)",
    gap: "6px 16px",
    margin: 0,
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
  },
  field: { display: "contents" },
  fieldLabel: { fontWeight: 600, color: "var(--console-text)" },
  fieldValue: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
    color: "var(--console-text-muted)",
  },
  code: {
    fontFamily: "var(--console-mono)",
    fontSize: "12px",
    color: "var(--console-text)",
    backgroundColor: "var(--console-card-soft)",
    borderRadius: "4px",
    padding: "1px 4px",
  },
  snippet: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    minWidth: 0,
  },
  snippetCode: {
    flex: 1,
    minWidth: 0,
    margin: 0,
    padding: "10px 12px",
    fontFamily: "var(--console-mono)",
    fontSize: "12px",
    lineHeight: 1.55,
    color: "var(--console-text)",
    backgroundColor: "var(--console-card-soft)",
    borderRadius: "6px",
    whiteSpace: "pre",
    overflowX: "auto",
  },
  developer: {
    minWidth: 0,
    padding: "14px 18px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--console-rule)",
    borderRadius: "8px",
  },
  developerSummary: {
    cursor: "pointer",
    fontFamily: "var(--console-ui)",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--console-text)",
  },
  developerClients: {
    marginTop: "14px",
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  developerHint: {
    display: "block",
    marginTop: "4px",
    fontWeight: 400,
    fontSize: "12px",
    color: "var(--console-text-muted)",
  },
});
