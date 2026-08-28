import {
  defaultTreeAdapter,
  parse,
  parseFragment,
  type DefaultTreeAdapterMap,
} from "parse5";

type HtmlNode = DefaultTreeAdapterMap["node"];
type HtmlChildNode = DefaultTreeAdapterMap["childNode"];
type HtmlDocument = DefaultTreeAdapterMap["document"];
type HtmlFragment = DefaultTreeAdapterMap["documentFragment"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlTemplate = DefaultTreeAdapterMap["template"];

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
  if (node.nodeName === "#document") {
    const document = node as HtmlDocument;
    return {
      type: "document",
      children: normalizeChildren(document.childNodes, options),
    };
  }
  if (node.nodeName === "#document-fragment") {
    const fragment = node as HtmlFragment;
    return {
      type: "fragment",
      children: normalizeChildren(fragment.childNodes, options),
    };
  }

  const element = node as HtmlElement;
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
      element.nodeName === "template"
        ? (element as HtmlTemplate).content.childNodes
        : element.childNodes,
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
