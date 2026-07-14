import { z } from "@brains/utils/zod";

const webChatSessionSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  lastActiveAt: z.string(),
});

const webChatSessionsResponseSchema = z.looseObject({
  sessions: z.array(webChatSessionSchema),
});

export interface WebChatSession {
  id: string;
  title: string;
  lastActiveAt: string;
}

export function describeFetchFailure(
  response: Response,
  fallback: string,
): string {
  if (response.status === 401 || response.status === 403) {
    return "Your operator session may have expired. Refresh or sign in again.";
  }
  return `${fallback} (${response.status})`;
}

export async function fetchWebChatSessions(): Promise<WebChatSession[]> {
  const response = await fetch("/api/chat/sessions", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(
      describeFetchFailure(response, "Could not load saved sessions."),
    );
  }
  const parsed = webChatSessionsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Could not load saved sessions.");
  }
  return parsed.data.sessions;
}
