import type { QueryClient } from "@tanstack/react-query";
import type { ChatClient } from "@brains/contracts/chat";
import { describeClientFailure, type WebChatSession } from "./api";
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

export async function renameWebChatSession(
  input: RenameWebChatSessionInput,
  client: ChatClient,
): Promise<void> {
  try {
    await client.renameSession(input.conversationId, input.title);
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not rename that session."),
      { cause: error },
    );
  }
}

export async function archiveWebChatSession(
  input: WebChatSessionMutationInput,
  client: ChatClient,
): Promise<void> {
  try {
    await client.archiveSession(input.conversationId);
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not archive that session."),
      { cause: error },
    );
  }
}

export async function deleteWebChatSession(
  input: WebChatSessionMutationInput,
  client: ChatClient,
): Promise<void> {
  try {
    await client.deleteSession(input.conversationId);
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not delete that session."),
      { cause: error },
    );
  }
}
