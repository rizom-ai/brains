import * as stylex from "@stylexjs/stylex";
type Name =
  | "identity"
  | "grid"
  | "column"
  | "section"
  | "heading"
  | "description"
  | "access"
  | "role"
  | "footer"
  | "actions"
  | "feedback"
  | "shell"
  | "name"
  | "pane"
  | "feedbackError"
  | "loading"
  | "person"
  | "personCopy"
  | "avatar"
  | "empty"
  | "stack"
  | "form"
  | "formLabel"
  | "field"
  | "inlineActions";
export const accountStyles: Record<Name, stylex.StyleXStyles> = stylex.create({
  shell: {
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    margin: 0,
    padding: {
      default: "36px 36px 48px",
      "@media (max-width: 640px)":
        "24px 20px calc(38px + env(safe-area-inset-bottom))",
    },
  },
  pane: {
    minWidth: 0,
    overflow: "auto",
    "@media (max-width: 640px)": { overflow: "visible" },
  },
  feedbackError: { color: "var(--console-err)" },
  loading: {
    margin: 0,
    padding: "36px 0",
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: "13px",
  },
  person: { display: "flex", alignItems: "center", gap: "13px" },
  personCopy: { minWidth: 0, display: "flex", flexDirection: "column" },
  avatar: {
    position: "relative",
    width: "32px",
    height: "32px",
    display: "inline-grid",
    placeItems: "center",
    flex: "0 0 auto",
    borderRadius: "50%",
    backgroundColor: "transparent",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--console-rule-strong)",
    color: "var(--console-text-dim)",
    fontFamily: "var(--console-mono)",
    fontSize: "12px",
    fontWeight: 500,
  },
  empty: {
    margin: 0,
    padding: "18px 12px",
    color: "var(--console-text-muted)",
    fontSize: "12px",
  },
  stack: { display: "grid", gap: "20px", minWidth: 0 },
  form: { display: "grid", gap: "10px", justifyItems: "start" },
  formLabel: {
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: "12px",
    fontWeight: 400,
  },
  field: { display: "grid", gap: "8px", width: "100%" },
  inlineActions: { display: "flex", flexWrap: "wrap", gap: "7px" },
  name: {
    fontFamily: "var(--console-display)",
    fontVariationSettings: '"SOFT" 70,"opsz" 40',
    fontSize: "24px",
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: "-0.5px",
    color: "var(--console-text)",
  },
  feedback: {
    color: "var(--console-ok)",
    fontFamily: "var(--console-mono)",
    fontSize: "10px",
    lineHeight: 1.5,
    letterSpacing: "0.04em",
    minHeight: { default: 22, ":empty": 0 },
    margin: { default: "10px 2px 0", ":empty": 0 },
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: 0,
    justifyContent: "flex-start",
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    fontFamily: "var(--console-ui)",
    fontSize: "12px",
    color: "var(--console-text-muted)",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: "12px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.4fr) minmax(220px,1fr)",
    marginTop: "28px",
    gap: "36px",
    borderTopWidth: 0,
    "@media (max-width:900px)": {
      gridTemplateColumns: "minmax(0,1fr)",
      gap: "28px",
    },
  },
  column: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "30px",
  },
  section: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: "16px",
    padding: 0,
  },
  heading: {
    margin: 0,
    paddingBottom: "12px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule-strong)",
    fontFamily: "var(--console-ui)",
    fontSize: "14px",
    fontWeight: 650,
    color: "var(--console-text)",
  },
  description: {
    margin: "10px 0 0",
    fontFamily: "var(--console-ui)",
    fontSize: "12px",
    lineHeight: 1.7,
    color: "var(--console-text-muted)",
  },
  access: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "16px 0",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--console-rule)",
    minWidth: 0,
  },

  role: {
    fontFamily: "var(--console-ui)",
    fontSize: "12px",
    color: "var(--console-text-muted)",
    marginTop: "7px",
  },
});
export function accountClass(
  name: string,
  ...styles: readonly (stylex.StyleXStyles | false | undefined)[]
): string {
  return `${name} ${stylex.props(...styles).className ?? ""}`;
}
