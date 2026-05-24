/** @jsxImportSource react */

import {
  parseInline,
  parseMarkdownSegments,
  type InlineNode,
} from "./markdown-parser";

function renderInline(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <span key={index}>{node.text}</span>;
      case "code":
        return <code key={index}>{node.text}</code>;
      case "bold":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "italic":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        return (
          <a
            key={index}
            href={node.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderText(text: string): React.ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph, index) => {
      const lines = paragraph.split("\n");
      return (
        <p className="web-chat-message-response" key={index}>
          {lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {renderInline(parseInline(line))}
            </span>
          ))}
        </p>
      );
    });
}

export function MarkdownResponse({
  children,
}: {
  children: string;
}): React.ReactElement {
  return (
    <div className="web-chat-markdown-response">
      {parseMarkdownSegments(children).map((segment, index) => {
        if (segment.type === "code") {
          return (
            <figure className="web-chat-code-block" key={index}>
              {segment.language ? (
                <figcaption>{segment.language}</figcaption>
              ) : null}
              <pre>
                <code>{segment.code}</code>
              </pre>
            </figure>
          );
        }
        return renderText(segment.text);
      })}
    </div>
  );
}
