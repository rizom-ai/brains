import { createChatApiPaths } from "@brains/contracts/chat";
import type { WebRouteDefinition } from "@brains/plugins";
import { uiAssetPath } from "./chat-page";

interface WebChatRouteHandlers {
  handleChatPage(request: Request): Promise<Response>;
  handleChatRequest(request: Request): Promise<Response>;
  handleRemoteAgentChatRequest(request: Request): Promise<Response>;
  handleRemoteAgentConfirmRequest(request: Request): Promise<Response>;
  handleActionRequest(request: Request): Promise<Response>;
  handleSessionsRequest(request: Request): Promise<Response>;
  handleDeleteSessionRequest(request: Request): Promise<Response>;
  handleRenameSessionRequest(request: Request): Promise<Response>;
  handleArchiveSessionRequest(request: Request): Promise<Response>;
  handleMessagesRequest(request: Request): Promise<Response>;
  handleContextSessionRequest(request: Request): Promise<Response>;
  handleDocumentAttachmentRequest(request: Request): Promise<Response>;
  handleImageAttachmentRequest(request: Request): Promise<Response>;
  handleJobStatusRequest(request: Request): Promise<Response>;
  handleUiAssetRequest(): Promise<Response>;
  handleUploadRequest(request: Request): Promise<Response>;
  handleUploadDownloadRequest(request: Request): Promise<Response>;
}

interface CreateWebChatRoutesOptions {
  routePath: string;
  apiPath: string;
  handlers: WebChatRouteHandlers;
}

export function createWebChatRoutes({
  routePath,
  apiPath,
  handlers,
}: CreateWebChatRoutesOptions): WebRouteDefinition[] {
  const paths = createChatApiPaths(apiPath);
  return [
    {
      path: routePath,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> => handlers.handleChatPage(request),
    },
    {
      path: paths.stream,
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleChatRequest(request),
    },
    {
      path: paths.actions,
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleActionRequest(request),
    },
    {
      path: paths.sessions,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleSessionsRequest(request),
    },
    {
      path: paths.sessions,
      method: "DELETE",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleDeleteSessionRequest(request),
    },
    {
      path: paths.sessions,
      method: "PUT",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleRenameSessionRequest(request),
    },
    {
      path: paths.sessionArchive,
      method: "PUT",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleArchiveSessionRequest(request),
    },
    {
      path: paths.messages,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleMessagesRequest(request),
    },
    {
      path: paths.contextSessions,
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleContextSessionRequest(request),
    },
    {
      path: paths.documentAttachments,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleDocumentAttachmentRequest(request),
    },
    {
      path: paths.imageAttachments,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleImageAttachmentRequest(request),
    },
    {
      path: paths.jobStatus,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleJobStatusRequest(request),
    },
    {
      path: uiAssetPath,
      method: "GET",
      public: true,
      handler: (): Promise<Response> => handlers.handleUiAssetRequest(),
    },
    {
      path: paths.uploads,
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleUploadRequest(request),
    },
    {
      path: paths.uploads,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleUploadDownloadRequest(request),
    },
    {
      path: "/api/agent/chat",
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleRemoteAgentChatRequest(request),
    },
    {
      path: "/api/agent/chat/confirm",
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleRemoteAgentConfirmRequest(request),
    },
  ];
}
