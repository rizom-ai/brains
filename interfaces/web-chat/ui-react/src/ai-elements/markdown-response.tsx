/** @jsxImportSource react */
import { memo } from "react";
import { Streamdown } from "streamdown";

export const MarkdownResponse = memo(function MarkdownResponse({
  children,
}: {
  children: string;
}): React.ReactElement {
  return (
    <Streamdown className="web-chat-markdown-response">{children}</Streamdown>
  );
});
