import * as stylex from "@stylexjs/stylex";

export const collectionMemberStyles: Record<
  "section" | "head" | "count",
  stylex.StyleXStyles
> = stylex.create({
  // Below the document, apart from it, like the rest of a collection's page.
  // Inset like the document above it, so the heading lines up with the body.
  section: {
    marginTop: 40,
    paddingTop: 20,
    paddingInline: 26,
    borderTop: "1px solid var(--console-rule)",
  },
  head: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 8,
  },
  count: {
    fontFamily: "var(--console-ui)",
    fontSize: 13,
    color: "var(--console-text-muted)",
  },
});
