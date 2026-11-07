import {
  BaseFormatConverter,
  getNodeChildren,
  isBlockquoteNode,
  isCodeNode,
  isDeleteNode,
  isEmphasisNode,
  isInlineCodeNode,
  isLinkNode,
  isListNode,
  isParagraphNode,
  isStrongNode,
  isTableNode,
  isTextNode,
  parseMarkdown,
  tableToAscii,
  type Content,
  type Root,
} from "chat";

/**
 * Markdown to WhatsApp's own formatting, and back.
 *
 * WhatsApp marks bold with single asterisks, italics with underscores and
 * strikethrough with single tildes, and has no headings, link syntax or
 * tables. Headings become bold lines, links show their address after the
 * text, and tables become monospace blocks.
 */
export class WhatsAppFormatConverter extends BaseFormatConverter {
  fromAst(ast: Root): string {
    return this.fromAstWithNodeConverter(ast, (node) => this.render(node));
  }

  /**
   * Single-asterisk bold and single-tilde strikethrough become their markdown
   * doubles before parsing; underscores mean italics in both. Ported from
   * `@chat-adapter/whatsapp` (MIT).
   */
  toAst(platformText: string): Root {
    const markdown = platformText
      .replace(/(?<!\*)\*(?!\*)([^\n*]+?)(?<!\*)\*(?!\*)/g, "**$1**")
      .replace(/(?<!~)~(?!~)([^\n~]+?)(?<!~)~(?!~)/g, "~~$1~~");
    return parseMarkdown(markdown);
  }

  private render(node: Content): string {
    if (isParagraphNode(node)) return this.children(node);
    if (isTextNode(node)) return node.value;
    if (isStrongNode(node)) return `*${this.children(node)}*`;
    if (isEmphasisNode(node)) return `_${this.children(node)}_`;
    if (isDeleteNode(node)) return `~${this.children(node)}~`;
    if (isInlineCodeNode(node)) return `\`${node.value}\``;
    if (isCodeNode(node)) return `\`\`\`\n${node.value}\n\`\`\``;
    if (isLinkNode(node)) {
      const text = this.children(node);
      return text === node.url ? node.url : `${text} (${node.url})`;
    }
    if (isBlockquoteNode(node)) {
      return getNodeChildren(node)
        .map((child) => `> ${this.render(child)}`)
        .join("\n");
    }
    if (isListNode(node)) {
      return this.renderList(node, 0, (child) => this.render(child), "-");
    }
    if (node.type === "heading") return `*${this.children(node)}*`;
    if (node.type === "break") return "\n";
    if (node.type === "thematicBreak") return "━━━";
    if (isTableNode(node)) return `\`\`\`\n${tableToAscii(node)}\n\`\`\``;
    return this.defaultNodeToText(node, (child) => this.render(child));
  }

  private children(node: Content): string {
    return getNodeChildren(node)
      .map((child) => this.render(child))
      .join("");
  }
}
