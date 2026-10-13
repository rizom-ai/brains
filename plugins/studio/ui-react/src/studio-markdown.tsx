/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  cloneElement,
  isValidElement,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  CodeBlockCopyButton,
  Streamdown,
  defaultRemarkPlugins,
  type Components,
} from "streamdown";
import { StudioEntityImage } from "./studio-entity-image";
import { isRecord } from "@brains/utils/is-record";
import { editorClassName as classes } from "./studio-editor.styles";
import { markdownStyles as s } from "./studio-markdown.styles";
import { typographyStyles } from "./studio-typography.styles";
import { codeTokens } from "./code-tokens";

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
  const lines = useMemo(() => codeTokens(source, language), [source, language]);

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
      <div
        {...stylex.props(s.codeScroller)}
        data-streamdown="code-block-body"
        tabIndex={0}
        role="region"
        aria-label={`${language} code; scroll horizontally when needed`}
      >
        <pre {...stylex.props(s.codePre)}>
          <code {...props} className={classes(className ?? "", s.codeBody)}>
            {lines.map((line, index) => (
              <span {...stylex.props(s.codeLine)} key={index}>
                <span {...stylex.props(s.lineNumber)} aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  {line.length
                    ? line.map((token, tokenIndex) => (
                        <span
                          {...stylex.props(s[token.kind])}
                          data-code-token={token.kind}
                          key={tokenIndex}
                        >
                          {token.text}
                        </span>
                      ))
                    : "\u200b"}
                </span>
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
    <div
      {...stylex.props(s.tableFrame)}
      data-streamdown="table-wrapper"
      tabIndex={0}
      role="region"
      aria-label="Markdown table; scroll horizontally when needed"
    >
      <table
        {...props}
        className={classes(className ?? "", s.table)}
        data-streamdown="table"
      />
    </div>
  );
}

const ENTITY_IMAGE_PREFIX = "entity://image/";
const PREVIEW_IMAGE_MARKER = "https://studio-entity-image.invalid/?";

/** Only image AST nodes are marked: source text and code examples stay literal.
 * The marker survives normal sanitization but is never used as a network URL. */
function entityImagePreviewPlugin(): (tree: unknown) => void {
  return function visit(node: unknown): void {
    if (!isRecord(node)) return;
    if (
      node["type"] === "image" &&
      typeof node["url"] === "string" &&
      node["url"].startsWith(ENTITY_IMAGE_PREFIX) &&
      node["url"].length > ENTITY_IMAGE_PREFIX.length
    )
      node["url"] =
        `${PREVIEW_IMAGE_MARKER}id=${encodeURIComponent(node["url"].slice(ENTITY_IMAGE_PREFIX.length))}`;
    if (Array.isArray(node["children"])) node["children"].forEach(visit);
  };
}
const previewRemarkPlugins = [
  ...Object.values(defaultRemarkPlugins),
  entityImagePreviewPlugin,
];

function MarkdownImage({
  node: _node,
  className,
  src,
  alt,
  ...props
}: MarkdownElementProps<"img">): ReactElement {
  const imageProps = {
    ...props,
    alt: alt ?? "",
    className: classes(className ?? "", s.image),
    "data-streamdown": "image",
  };
  const imageId =
    typeof src === "string" && src.startsWith(PREVIEW_IMAGE_MARKER)
      ? new URLSearchParams(src.slice(PREVIEW_IMAGE_MARKER.length)).get("id")
      : null;
  return imageId ? (
    <StudioEntityImage {...imageProps} imageId={imageId} />
  ) : (
    <img {...imageProps} src={src} />
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
  tr: ({ node: _node, className, ...props }) => (
    <tr {...props} className={classes(className ?? "", s.tableRow)} />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      {...props}
      className={classes(
        className ?? "",
        s.tableHeaderCell,
        typographyStyles.eyebrow,
      )}
      data-streamdown="table-header-cell"
      scope="col"
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td
      {...props}
      className={classes(className ?? "", s.tableCell)}
      data-streamdown="table-cell"
    />
  ),
  img: MarkdownImage,
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
  /(^|\n)[ \t]{0,3}(?:`{3,}|~{3,})|!\[[^\]]*\]\(|^\s*\|.+\|\s*$|^[ \t]*\|?[ \t]*:?-+:?[ \t]*\|[ \t]*:?-+:?/m;

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
      remarkPlugins={previewRemarkPlugins}
    >
      {props.children}
    </Streamdown>
  );
}
