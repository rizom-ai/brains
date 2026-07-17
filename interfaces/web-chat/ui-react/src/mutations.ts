import type { QueryClient } from "@tanstack/react-query";
import { describeFetchFailure, type WebChatSession } from "./api";
import { webChatKeys } from "./queries";

export interface WebChatSessionMutationInput {
  conversationId: string;
}

export interface RenameWebChatSessionInput extends WebChatSessionMutationInput {
  title: string;
}

export function renameWebChatSessionCache(
  queryClient: QueryClient,
  input: RenameWebChatSessionInput,
): void {
  queryClient.setQueryData<WebChatSession[]>(
    webChatKeys.sessions(),
    (current = []) =>
      current.map((session) =>
        session.id === input.conversationId
          ? { ...session, title: input.title }
          : session,
      ),
  );
}

export function removeWebChatSessionCaches(
  queryClient: QueryClient,
  conversationId: string,
): void {
  queryClient.removeQueries({ queryKey: webChatKeys.history(conversationId) });
  queryClient.setQueryData<WebChatSession[]>(
    webChatKeys.sessions(),
    (current = []) =>
      current.filter((session) => session.id !== conversationId),
  );
}

async function requireSuccessfulMutation(
  response: Response,
  fallback: string,
): Promise<void> {
  if (response.ok) return;
  throw new Error(describeFetchFailure(response, fallback));
}

export async function renameWebChatSession(
  input: RenameWebChatSessionInput,
): Promise<void> {
  const response = await fetch(
    `/api/chat/sessions?id=${encodeURIComponent(input.conversationId)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title }),
    },
  );
  await requireSuccessfulMutation(response, "Could not rename that session.");
}

export async function archiveWebChatSession(
  input: WebChatSessionMutationInput,
): Promise<void> {
  const response = await fetch(
    `/api/chat/sessions/archive?id=${encodeURIComponent(input.conversationId)}`,
    { method: "PUT", credentials: "include" },
  );
  await requireSuccessfulMutation(response, "Could not archive that session.");
}

export async function deleteWebChatSession(
  input: WebChatSessionMutationInput,
): Promise<void> {
  const response = await fetch(
    `/api/chat/sessions?id=${encodeURIComponent(input.conversationId)}`,
    { method: "DELETE", credentials: "include" },
  );
  await requireSuccessfulMutation(response, "Could not delete that session.");
}
