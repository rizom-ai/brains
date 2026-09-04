import { describe, expect, it } from "bun:test";
import { createChatApiPaths } from "@brains/contracts/chat";
import { createWebChatRoutes } from "../src/web-routes";

const ok = (): Promise<Response> => Promise.resolve(new Response("ok"));

describe("Web Chat public API routes", () => {
  it("registers every headless Chat operation below the configured API path", () => {
    const apiPath = "/custom/chat-api";
    const paths = createChatApiPaths(apiPath);
    const routes = createWebChatRoutes({
      routePath: "/chat",
      apiPath,
      handlers: {
        handleChatPage: ok,
        handleChatRequest: ok,
        handleRemoteAgentChatRequest: ok,
        handleRemoteAgentConfirmRequest: ok,
        handleActionRequest: ok,
        handleSessionsRequest: ok,
        handleDeleteSessionRequest: ok,
        handleRenameSessionRequest: ok,
        handleArchiveSessionRequest: ok,
        handleMessagesRequest: ok,
        handleContextSessionRequest: ok,
        handleDocumentAttachmentRequest: ok,
        handleImageAttachmentRequest: ok,
        handleJobStatusRequest: ok,
        handleUiAssetRequest: ok,
        handleUiStylesheetRequest: ok,
        handleUploadRequest: ok,
        handleUploadDownloadRequest: ok,
      },
    });
    const registered = new Set(routes.map((route) => route.path));

    expect(registered).toContain(paths.stream);
    expect(registered).toContain(paths.actions);
    expect(registered).toContain(paths.sessions);
    expect(registered).toContain(paths.sessionArchive);
    expect(registered).toContain(paths.messages);
    expect(registered).toContain(paths.uploads);
    expect(registered).toContain(paths.contextSessions);
    expect(registered).toContain(paths.documentAttachments);
    expect(registered).toContain(paths.imageAttachments);
    expect(registered).toContain(paths.jobStatus);
    expect(registered).not.toContain("/api/chat/sessions");
  });
});
