/** @jsxImportSource react */
import type { EventChatAction } from "@brains/contracts";
import type { UIMessage } from "ai";
import {
  ActionsPart,
  AttachmentPart,
  ConfirmationPart,
  GenericDataPart,
  NativeToolPart,
  SourcesPart,
  ToolCallsGroup,
  ToolResultPart,
} from "../ai-elements/data-parts";
import { MessageResponse } from "../ai-elements/message";
import { groupMessagePartSections, type RenderedPart } from "../message-parts";
import { ProgressPart } from "./progress-part";
import { UploadedFilePart } from "./uploaded-file-part";

export interface MessageSectionHandlers {
  addToolApprovalResponse: (input: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void | PromiseLike<void>;
  onPromptAction: (prompt: string) => void;
  onEventAction: (action: EventChatAction) => void;
}

function renderMessagePart(
  group: RenderedPart,
  key: string,
  handlers: MessageSectionHandlers,
): React.ReactElement | null {
  if (group.kind === "text") {
    return <MessageResponse key={key}>{group.text}</MessageResponse>;
  }
  if (group.kind === "tools") {
    if (group.tools.length === 1) {
      return <ToolResultPart key={key} data={group.tools[0]} />;
    }
    return <ToolCallsGroup key={key} tools={group.tools} />;
  }
  if (group.kind === "confirmation") {
    return (
      <ConfirmationPart
        key={key}
        data={group.data}
        addToolApprovalResponse={handlers.addToolApprovalResponse}
      />
    );
  }
  if (group.kind === "native-tool") {
    return <NativeToolPart key={key} data={group.data} />;
  }
  if (group.kind === "attachment") {
    return <AttachmentPart key={key} data={group.data} />;
  }
  if (group.kind === "progress") {
    return <ProgressPart key={key} data={group.data} />;
  }
  if (group.kind === "sources") {
    return <SourcesPart key={key} data={group.data} />;
  }
  if (group.kind === "actions") {
    return (
      <ActionsPart
        key={key}
        data={group.data}
        onPromptAction={handlers.onPromptAction}
        onEventAction={handlers.onEventAction}
      />
    );
  }
  if (group.kind === "file") {
    return (
      <UploadedFilePart
        key={key}
        filename={group.filename}
        mediaType={group.mediaType}
        url={group.url}
      />
    );
  }
  return <GenericDataPart key={key} type={group.type} data={group.data} />;
}

/**
 * Renders one message's parts in section order: body, then sources, actions,
 * and collapsed details — regardless of the order they streamed in.
 */
export function MessageSections({
  parts,
  handlers,
}: {
  parts: UIMessage["parts"];
  handlers: MessageSectionHandlers;
}): React.ReactElement {
  const sections = groupMessagePartSections(parts);
  return (
    <>
      {sections.body.map((group, index) =>
        renderMessagePart(group, `body-${index}`, handlers),
      )}
      {sections.sources.map((group, index) =>
        renderMessagePart(group, `sources-${index}`, handlers),
      )}
      {sections.actions.map((group, index) =>
        renderMessagePart(group, `actions-${index}`, handlers),
      )}
      {sections.details.map((group, index) =>
        renderMessagePart(group, `details-${index}`, handlers),
      )}
    </>
  );
}
