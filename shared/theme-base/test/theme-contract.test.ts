import { describe, expect, it } from "bun:test";
import { themeBaseCSS } from "../src";

const APP_COLOR_TOKENS = [
  "--color-bg-card",
  "--color-success",
  "--color-warning",
  "--color-error",
  "--color-on-accent",
] as const;

function themeBlock(theme: "light" | "dark"): string {
  const match = themeBaseCSS.match(
    new RegExp(`\\[data-theme="${theme}"\\] \\{(?<body>[\\s\\S]*?)\\n  \\}`),
  );
  const body = match?.groups?.["body"];
  if (!body) throw new Error(`Missing ${theme} theme contract`);
  return body;
}

describe("app theme token contract", () => {
  it.each(["light", "dark"] as const)(
    "defines every app token under the %s theme",
    (theme) => {
      const block = themeBlock(theme);
      for (const token of APP_COLOR_TOKENS) {
        expect(block).toContain(`${token}: var(`);
      }
    },
  );

  it("derives status signals from the shared semantic status palette", () => {
    for (const theme of ["light", "dark"] as const) {
      const block = themeBlock(theme);
      expect(block).toContain(
        "--color-success: var(--color-status-success-text)",
      );
      expect(block).toContain(
        "--color-warning: var(--color-status-warning-text)",
      );
      expect(block).toContain("--color-error: var(--color-status-danger-text)");
    }
  });
});
