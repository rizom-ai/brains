import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const packageRoot = join(import.meta.dir, "..");
const visualRefreshCss = readFileSync(
  join(packageRoot, "src", "visual-refresh.css"),
  "utf-8",
);
const chatPageCss = readFileSync(
  join(packageRoot, "src", "chat-page.css"),
  "utf-8",
);
const appTsx = readFileSync(
  join(packageRoot, "ui-react", "src", "App.tsx"),
  "utf-8",
);

/** The part of a stylesheet before its first media query — rules that apply
 * at every viewport width. */
function baseScope(css: string): string {
  const index = css.indexOf("@media");
  return index === -1 ? css : css.slice(0, index);
}

/** Extract the body of the first `selector { … }` block within scope. */
function ruleBody(scope: string, selector: string): string {
  const start = scope.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = scope.indexOf("{", start);
  const close = scope.indexOf("}", open);
  return scope.slice(open + 1, close);
}

describe("composer streamline (pill at every width)", () => {
  const base = baseScope(visualRefreshCss);

  it("hides the MESSAGE kicker label at all widths", () => {
    expect(ruleBody(base, ".web-chat-prompt-input label")).toContain(
      "display: none",
    );
  });

  it("lays the composer out as the attach / message / send pill at base scope", () => {
    const group = ruleBody(
      base,
      '.web-chat-prompt-input > [data-slot="input-group"]',
    );
    expect(group).toContain("grid-template-columns: 44px minmax(0, 1fr) 44px");
    expect(group).toContain("border-radius: 22px");
  });

  it("renders the attach control as a 44px glyph circle at base scope", () => {
    const attach = ruleBody(base, ".web-chat-prompt-attach {");
    expect(attach).toContain("border-radius: 50%");
    expect(ruleBody(base, ".web-chat-prompt-attach::before")).toContain(
      'content: "+"',
    );
  });

  it("renders the submit control as a 44px circle at base scope", () => {
    const submit = ruleBody(base, ".web-chat-prompt-submit {");
    expect(submit).toContain("width: 44px");
    expect(submit).toContain("height: 44px");
  });

  it("centers the pill in the 900px manuscript column at desktop", () => {
    const group = ruleBody(
      base,
      '.web-chat-prompt-input > [data-slot="input-group"]',
    );
    expect(group).toContain("max-width: 900px");
    expect(group).toContain("margin-inline: auto");
  });

  it("drops the keyboard hint chips from the composer markup", () => {
    expect(appTsx).not.toContain("web-chat-prompt-hint");
    expect(appTsx).not.toContain("<kbd>");
  });

  it("carries no dead hint styles once the markup is gone", () => {
    expect(visualRefreshCss).not.toContain(".web-chat-prompt-hint");
    expect(chatPageCss).not.toContain(".web-chat-prompt-hint");
  });

  it("keeps the legacy boxed instrument card out of the refreshed surface", () => {
    // chat-page.css still defines the boxed card; visual-refresh must
    // neutralize its clip-path spine at base scope so no width shows it.
    expect(ruleBody(base, ".web-chat-prompt-input {")).toContain(
      "clip-path: none",
    );
    expect(ruleBody(base, ".web-chat-prompt-input::before")).toContain(
      "display: none",
    );
  });
});
