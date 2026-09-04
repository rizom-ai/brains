import {
  defaultTreeAdapter,
  parse,
  parseFragment,
  type DefaultTreeAdapterMap,
} from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlChildNode = DefaultTreeAdapterMap["childNode"];

export type NormalizedHtmlNode =
  | { type: "document" | "fragment"; children: NormalizedHtmlNode[] }
  | {
      type: "element";
      name: string;
      namespace: string;
      attributes: Array<[name: string, value: string]>;
      children: NormalizedHtmlNode[];
    }
  | { type: "text" | "comment"; value: string }
  | {
      type: "doctype";
      name: string;
      publicId: string;
      systemId: string;
    };

export interface NormalizeRendererHtmlOptions {
  /**
   * React 19 inserts preload links for eager images while Preact does not.
   * Ignore those renderer-owned hints while keeping every other link intact.
   */
  ignoreImagePreloads?: boolean | undefined;
  /**
   * React 19 hoists preconnect hints ahead of scripts in the document head.
   * Canonicalize only that semantically neutral placement. Defaults to true.
   */
  normalizePreconnectOrder?: boolean | undefined;
}

/**
 * Parse renderer output into a stable semantic tree.
 *
 * Parsing folds entity spelling and HTML boolean-attribute serialization.
 * Style values additionally ignore only a trailing declaration separator.
 */
export function normalizeRendererHtml(
  html: string,
  options: NormalizeRendererHtmlOptions = {},
): NormalizedHtmlNode {
  const root = looksLikeDocument(html) ? parse(html) : parseFragment(html);
  return normalizeNode(root, options);
}

function looksLikeDocument(html: string): boolean {
  return /^\s*(?:<!doctype\s|<html(?:\s|>))/i.test(html);
}

function normalizeNode(
  node: HtmlNode,
  options: NormalizeRendererHtmlOptions,
): NormalizedHtmlNode {
  if (defaultTreeAdapter.isTextNode(node)) {
    return { type: "text", value: node.value };
  }
  if (defaultTreeAdapter.isCommentNode(node)) {
    return { type: "comment", value: node.data };
  }
  if (defaultTreeAdapter.isDocumentTypeNode(node)) {
    return {
      type: "doctype",
      name: node.name,
      publicId: node.publicId,
      systemId: node.systemId,
    };
  }
  // parse5's node union has predicates for text, comment and doctype but not
  // for the rest, so these narrow on the members they are about to read. A
  // node arriving without them says so here rather than several reads later.
  if (node.nodeName === "#document" || node.nodeName === "#document-fragment") {
    return {
      type: node.nodeName === "#document" ? "document" : "fragment",
      children: normalizeChildren(node.childNodes, options),
    };
  }

  if (!defaultTreeAdapter.isElementNode(node)) {
    throw new Error(`Unexpected node in rendered HTML: ${node.nodeName}`);
  }
  const element = node;
  return {
    type: "element",
    name: element.tagName,
    namespace: element.namespaceURI,
    attributes: element.attrs
      .map(({ name, value }): [string, string] => [
        name,
        name === "style" ? normalizeStyle(value) : value,
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
    children: normalizeChildren(
      "content" in element ? element.content.childNodes : element.childNodes,
      options,
    ),
  };
}

function normalizeChildren(
  children: HtmlChildNode[],
  options: NormalizeRendererHtmlOptions,
): NormalizedHtmlNode[] {
  const filtered = children.filter(
    (child) =>
      !(options.ignoreImagePreloads === true && isImagePreloadLink(child)),
  );
  const ordered =
    options.normalizePreconnectOrder === false
      ? filtered
      : movePreconnectsAheadOfScripts(filtered);
  return ordered.map((child) => normalizeNode(child, options));
}

function normalizeStyle(style: string): string {
  return style.trim().replace(/;+$/, "");
}

function movePreconnectsAheadOfScripts(
  children: HtmlChildNode[],
): HtmlChildNode[] {
  const preconnects = children.filter(isPreconnectLink);
  if (preconnects.length === 0) return children;

  const remaining = children.filter((child) => !isPreconnectLink(child));
  const firstScript = remaining.findIndex(
    (child) => child.nodeName === "script",
  );
  if (firstScript < 0) return [...preconnects, ...remaining];
  return [
    ...remaining.slice(0, firstScript),
    ...preconnects,
    ...remaining.slice(firstScript),
  ];
}

function isImagePreloadLink(node: HtmlChildNode): boolean {
  const attributes = linkAttributes(node);
  return (
    attributes?.get("rel") === "preload" && attributes.get("as") === "image"
  );
}

function isPreconnectLink(node: HtmlChildNode): boolean {
  return linkAttributes(node)?.get("rel") === "preconnect";
}

function linkAttributes(node: HtmlChildNode): Map<string, string> | undefined {
  if (node.nodeName !== "link") return undefined;
  return new Map(node.attrs.map(({ name, value }) => [name, value]));
}
