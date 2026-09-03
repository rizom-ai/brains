import { describe, expect, it } from "bun:test";
import stylexPlugin from "@stylexjs/babel-plugin";
import { transformStylexSource } from "../src/stylex-bun-plugin";

describe("StyleX Bun transform", () => {
  it("lowers declarations to static classes and collected CSS", async () => {
    const result = transformStylexSource(
      `
        import * as stylex from "@stylexjs/stylex";
        const styles = stylex.create({ button: { color: "var(--console-text)" } });
        export const buttonProps = stylex.props(styles.button);
      `,
      "fixture.tsx",
    );
    const css = stylexPlugin.processStylexRules(result.rules);

    expect(result.code).not.toContain("stylex.create");
    expect(result.code).toContain("className");
    expect(css).toContain("color:var(--console-text)");
    expect(css).not.toContain("insertRule");
  });
});
