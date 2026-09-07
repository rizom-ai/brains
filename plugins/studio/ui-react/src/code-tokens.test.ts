import { expect, test } from "bun:test";
import { codeTokens } from "./code-tokens";

for (const [language, source] of [
  [
    "ts",
    'const answer: number = 42;\n// keep this comment\nconsole.log("hello");\n',
  ],
  ["javascript", 'const view = "<script>alert(1)</script>";'],
  ["tsx", 'const view = <div title="hello">{42}</div>;'],
  ["css", "/* note */\n.card { color: red; width: 20px; }"],
  ["html", '<div title="hello">world</div>'],
  ["json", '{"count":42,"ready":true}'],
] as const) {
  test(`highlights ${language} without changing source text`, () => {
    const lines = codeTokens(source, language);
    expect(
      lines.map((line) => line.map((token) => token.text).join("")).join("\n"),
    ).toBe(source);
    expect(lines.flat().some((token) => token.kind !== "plain")).toBe(true);
  });
}
test("uses semantic token classes rather than generated HTML", () => {
  const tokens = codeTokens(
    'const answer = 42; // note\nconst text = "<b>raw</b>";',
    "TS",
  ).flat();
  expect(tokens).toContainEqual({ text: "const", kind: "keyword" });
  expect(tokens).toContainEqual({ text: "42", kind: "number" });
  expect(tokens).toContainEqual({ text: "// note", kind: "comment" });
  expect(tokens).toContainEqual({ text: '"<b>raw</b>"', kind: "string" });
});
test("keeps unknown languages and oversized blocks in plain text", () => {
  for (const [source, language] of [
    ["\tunknown α\n\n", "unknown"],
    ["x".repeat(50_001), "js"],
  ] as const) {
    const lines = codeTokens(source, language);
    expect(lines.flat().every((token) => token.kind === "plain")).toBe(true);
    expect(
      lines.map((line) => line.map((token) => token.text).join("")).join("\n"),
    ).toBe(source);
  }
});
test("tolerates incomplete streaming syntax and preserves blank lines", () => {
  const source = '\nconst text = "unfinished\n\n';
  expect(
    codeTokens(source, "js")
      .map((line) => line.map((token) => token.text).join(""))
      .join("\n"),
  ).toBe(source);
});
