/** @jsxImportSource react */

type MarkdownSegment =
  | { type: "code"; code: string; language: string | undefined }
  | { type: "text"; text: string };

function parseMarkdownSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(markdown)) !== null) {
    if (match.index > cursor) {
      segments.push({
        type: "text",
        text: markdown.slice(cursor, match.index),
      });
    }
    const language = match[1]?.trim();
    segments.push({
      type: "code",
      language: language && language.length > 0 ? language : undefined,
      code: match[2] ?? "",
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < markdown.length) {
    segments.push({ type: "text", text: markdown.slice(cursor) });
  }

  return segments;
}

function renderText(text: string): React.ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph, index) => (
      <p className="web-chat-message-response" key={index}>
        {paragraph.split("\n").map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </p>
    ));
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
