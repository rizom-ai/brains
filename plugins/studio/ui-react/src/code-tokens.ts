import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { parser as javascript } from "@lezer/javascript";
import { parser as css } from "@lezer/css";
import { parser as html } from "@lezer/html";
import { parser as json } from "@lezer/json";

const kinds = [
  "keyword",
  "string",
  "number",
  "comment",
  "name",
  "operator",
] as const;
export type CodeTokenKind = (typeof kinds)[number] | "plain";
export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const highlighter = tagHighlighter([
  { tag: [tags.keyword, tags.bool, tags.null], class: "keyword" },
  { tag: [tags.string, tags.regexp], class: "string" },
  { tag: tags.number, class: "number" },
  { tag: tags.comment, class: "comment" },
  {
    tag: [tags.typeName, tags.propertyName, tags.tagName, tags.attributeName],
    class: "name",
  },
  { tag: tags.operator, class: "operator" },
]);
const typescript = javascript.configure({ dialect: "ts" });
const jsx = javascript.configure({ dialect: "jsx" });
const tsx = javascript.configure({ dialect: "ts jsx" });

/** Local, bounded tokenization. Unknown languages and large blocks remain readable plaintext. */
export function codeTokens(source: string, language: string): CodeToken[][] {
  const parser = ((): typeof javascript | undefined => {
    switch (language.toLowerCase()) {
      case "js":
      case "javascript":
        return javascript;
      case "ts":
      case "typescript":
        return typescript;
      case "jsx":
        return jsx;
      case "tsx":
        return tsx;
      case "css":
        return css;
      case "html":
        return html;
      case "json":
        return json;
      default:
        return undefined;
    }
  })();
  if (!parser || source.length > 50_000)
    return source
      .split("\n")
      .map((text) => ({ text, kind: "plain" as const }))
      .map((token) => [token]);
  const lines: CodeToken[][] = [];
  let line: CodeToken[] = [];
  lines.push(line);
  const append = (text: string, kind: CodeTokenKind): void => {
    text.split("\n").forEach((part, index) => {
      if (index) {
        line = [];
        lines.push(line);
      }
      if (part) line.push({ text: part, kind });
    });
  };
  let offset = 0;
  highlightTree(parser.parse(source), highlighter, (from, to, classes) => {
    append(source.slice(offset, from), "plain");
    append(
      source.slice(from, to),
      kinds.find((kind) => classes.split(" ").includes(kind)) ?? "plain",
    );
    offset = to;
  });
  append(source.slice(offset), "plain");
  return lines;
}
