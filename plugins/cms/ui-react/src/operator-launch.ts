import { cmsWorkspacePath } from "../../src/cms-paths";
import { workspaceUrlHref } from "./workspace-url-query";

interface InboxChatPrefillState {
  readonly webChatPrefill: {
    readonly version: 2;
    readonly text: string;
    readonly context: {
      readonly sourceId: string;
      readonly itemId: string;
      readonly label: string;
    };
  };
}

export function createInboxChatPrefillState(
  sourceId: string,
  itemId: string,
  label: string,
): InboxChatPrefillState {
  return {
    webChatPrefill: {
      version: 2,
      text: "Help me understand this Inbox item and decide what to do next.",
      context: { sourceId, itemId, label },
    },
  };
}

export function inboxDetailWorkspaceHref(
  cmsBasePath: string,
  currentSearch: string,
  sourceId: string,
  itemId: string,
): string {
  return workspaceUrlHref(
    cmsWorkspacePath(cmsBasePath, "unified-inbox:inbox"),
    {
      ...Object.fromEntries(new URLSearchParams(currentSearch)),
      detailSourceId: sourceId,
      detailItemId: itemId,
    },
  );
}
