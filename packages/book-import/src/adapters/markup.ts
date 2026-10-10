import type { Element, Node } from "happy-dom";

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;

/** Characters markdown would read as markup; the text keeps them literal. */
const MARKDOWN_SPECIAL = /[\\`*_<>]/g;

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

export function nameOf(node: Node): string {
  return isElement(node) ? node.localName : "";
}

/** A text with markdown's characters escaped, so it stays text. */
export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, (character) => `\\${character}`);
}

/** Emphasis set in two types within a word, read as one: *V**é**ron* is *Véron*, *Hobbes**:* is *Hobbes:*. */
export function mergedEmphasis(text: string): string {
  return text.replace(/(?<=[^\s*\\])\*\*(?=[^\s*])/gu, "");
}

/**
 * Text the author set off, marked as emphasis around its words, the spaces
 * outside. Emphasis within emphasis is the same emphasis; escaped stars stay.
 */
export function emphasised(inner: string): string {
  const plain = inner.replace(/(?<!\\)\*/g, "");
  const word = plain.trim();
  if (word.length === 0) return plain;
  const lead = plain.slice(0, plain.length - plain.trimStart().length);
  const trail = plain.slice(plain.trimEnd().length);
  return `${lead}*${word}*${trail}`;
}
