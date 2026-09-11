/** @jsxImportSource react */
import { cloneElement, isValidElement, type ReactElement } from "react";
import { Streamdown, type Components } from "streamdown";
import { editorClassName as classes } from "./studio-editor.styles";
import { markdownStyles as s } from "./studio-markdown.styles";

const documentComponents: Components = {
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
  inlineCode: ({ node: _node, className, ...props }) => (
    <code
      {...props}
      data-streamdown="inline-code"
      className={classes(className ?? "", s.code)}
    />
  ),
  pre: ({ children }) =>
    isValidElement<{ className?: string; "data-block"?: string }>(children)
      ? cloneElement(children, {
          "data-block": "true",
          className: classes(children.props.className ?? "", s.fenced),
        })
      : children,
};
const assistComponents: Components = {
  p: ({ node: _node, className, ...props }) => (
    <p {...props} className={classes(className ?? "", s.assist)} />
  ),
};
/** Native prose slots; Streamdown retains parsing, safe links and code controls. */
export function StudioMarkdown(props: {
  children: string;
  presentation?: "document" | "assist";
}): ReactElement {
  return (
    <Streamdown
      components={
        props.presentation === "document"
          ? documentComponents
          : assistComponents
      }
    >
      {props.children}
    </Streamdown>
  );
}
