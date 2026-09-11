/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { CodeBlockCopyButton, Streamdown, type Components } from "streamdown";
import { editorClassName as classes } from "./studio-editor.styles";
import { markdownStyles as s } from "./studio-markdown.styles";

type MarkdownElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  ComponentProps<Tag> & { node?: unknown };

function sourceText(children: ReactNode): string {
  const source = Array.isArray(children)
    ? children.join("")
    : typeof children === "string"
      ? children
      : String(children ?? "");
  return source.endsWith("\n") ? source.slice(0, -1) : source;
}

function MarkdownCode({
  node: _node,
  className,
  children,
  ...props
}: MarkdownElementProps<"code">): ReactElement {
  const source = sourceText(children);
  const language =
    /(?:^|\s)language-([^\s]+)/.exec(className ?? "")?.[1] ?? "text";
  const lines = source.split("\n");

  return (
    <figure
      {...stylex.props(s.codeBlock)}
      data-language={language}
      data-streamdown="code-block"
    >
      <figcaption
        {...stylex.props(s.codeHeader)}
        data-streamdown="code-block-header"
      >
        <span {...stylex.props(s.codeLanguage)}>{language}</span>
        <span
          {...stylex.props(s.codeActions)}
          data-streamdown="code-block-actions"
        >
          <CodeBlockCopyButton
            code={source}
            className={stylex.props(s.copyButton).className}
          />
        </span>
      </figcaption>
      <div {...stylex.props(s.codeScroller)} data-streamdown="code-block-body">
        <pre {...stylex.props(s.codePre)}>
          <code {...props} className={classes(className ?? "", s.codeBody)}>
            {lines.map((line, index) => (
              <span {...stylex.props(s.codeLine)} key={index}>
                <span {...stylex.props(s.lineNumber)} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{line || "\u200b"}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}

function MarkdownTable({
  node: _node,
  className,
  ...props
}: MarkdownElementProps<"table">): ReactElement {
  return (
    <div {...stylex.props(s.tableFrame)} data-streamdown="table-wrapper">
      <table
        {...props}
        className={classes(className ?? "", s.table)}
        data-streamdown="table"
      />
    </div>
  );
}

const structuralComponents: Components = {
  inlineCode: ({ node: _node, className, ...props }) => (
    <code
      {...props}
      data-streamdown="inline-code"
      className={classes(className ?? "", s.code)}
    />
  ),
  pre: ({ children }) =>
    isValidElement<{ className?: string; "data-block"?: string }>(children)
      ? cloneElement(children, { "data-block": "true" })
      : children,
  code: MarkdownCode,
  table: MarkdownTable,
  thead: ({ node: _node, className, ...props }) => (
    <thead {...props} className={classes(className ?? "", s.tableHead)} />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      {...props}
      className={classes(className ?? "", s.tableHeaderCell)}
      data-streamdown="table-header-cell"
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td
      {...props}
      className={classes(className ?? "", s.tableCell)}
      data-streamdown="table-cell"
    />
  ),
  img: ({ node: _node, className, alt, ...props }) => (
    <img
      {...props}
      alt={alt ?? ""}
      className={classes(className ?? "", s.image)}
      data-streamdown="image"
    />
  ),
};

const documentComponents: Components = {
  ...structuralComponents,
  h1: ({ node: _node, className, ...props }) => (
    <h1 {...props} className={classes(className ?? "", s.heading, s.h1)} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 {...props} className={classes(className ?? "", s.heading, s.h2)} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 {...props} className={classes(className ?? "", s.heading, s.h3)} />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p {...props} className={classes(className ?? "", s.paragraph)} />
  ),
  em: ({ node: _node, className, ...props }) => (
    <em {...props} className={classes(className ?? "", s.emphasis)} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote {...props} className={classes(className ?? "", s.quote)} />
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul {...props} className={classes(className ?? "", s.list)} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol {...props} className={classes(className ?? "", s.list)} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li {...props} className={classes(className ?? "", s.item)} />
  ),
};
const chatComponents: Components = structuralComponents;
const assistComponents: Components = {
  ...structuralComponents,
  p: ({ node: _node, className, ...props }) => (
    <p {...props} className={classes(className ?? "", s.assist)} />
  ),
};

const CHAT_STRUCTURE_PATTERN =
  /(^|\n)[ \t]{0,3}(?:`{3,}|~{3,})|!\[[^\]]*\]\(|^\s*\|.+\|\s*$/m;

/** Native prose slots and Studio-owned controls for complete markdown. */
export function StudioMarkdown(props: {
  children: string;
  className?: string | undefined;
  presentation?: "document" | "assist" | "chat";
}): ReactElement {
  const components =
    props.presentation === "document"
      ? documentComponents
      : props.presentation === "chat"
        ? CHAT_STRUCTURE_PATTERN.test(props.children)
          ? chatComponents
          : undefined
        : assistComponents;
  return (
    <Streamdown
      {...(props.className ? { className: props.className } : {})}
      {...(components ? { components } : {})}
      controls={false}
    >
      {props.children}
    </Streamdown>
  );
}
