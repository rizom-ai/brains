import type { WebRouteDefinition } from "@brains/plugins";
import { uiAssetPath } from "./chat-page";

interface WebChatRouteHandlers {
  handleChatPage(request: Request): Promise<Response>;
  handleChatRequest(request: Request): Promise<Response>;
  handleRemoteAgentChatRequest(request: Request): Promise<Response>;
  handleRemoteAgentConfirmRequest(request: Request): Promise<Response>;
  handleBootstrapRequest(request: Request): Promise<Response>;
  handleActionRequest(request: Request): Promise<Response>;
  handleSessionsRequest(request: Request): Promise<Response>;
  handleDeleteSessionRequest(request: Request): Promise<Response>;
  handleRenameSessionRequest(request: Request): Promise<Response>;
  handleArchiveSessionRequest(request: Request): Promise<Response>;
  handleMessagesRequest(request: Request): Promise<Response>;
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
  return [
    {
      path: routePath,
      method: "GET",
      public: true,
      handler: (request): Promise<Response> => handlers.handleChatPage(request),
    },
    {
      path: apiPath,
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleChatRequest(request),
    },
    {
      path: "/api/chat/bootstrap",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleBootstrapRequest(request),
    },
    {
      path: "/api/chat/actions",
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleActionRequest(request),
    },
    {
      path: "/api/chat/sessions",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleSessionsRequest(request),
    },
    {
      path: "/api/chat/sessions",
      method: "DELETE",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleDeleteSessionRequest(request),
    },
    {
      path: "/api/chat/sessions",
      method: "PUT",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleRenameSessionRequest(request),
    },
    {
      path: "/api/chat/sessions/archive",
      method: "PUT",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleArchiveSessionRequest(request),
    },
    {
      path: "/api/chat/messages",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleMessagesRequest(request),
    },
    {
      path: "/api/chat/attachments/document",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleDocumentAttachmentRequest(request),
    },
    {
      path: "/api/chat/attachments/image",
      method: "GET",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleImageAttachmentRequest(request),
    },
    {
      path: "/api/chat/jobs/status",
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
      path: "/api/chat/uploads",
      method: "POST",
      public: true,
      handler: (request): Promise<Response> =>
        handlers.handleUploadRequest(request),
    },
    {
      path: "/api/chat/uploads",
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
