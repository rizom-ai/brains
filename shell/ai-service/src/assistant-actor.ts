import type { ConversationMessageActor } from "@brains/conversation-service";
import type { BrainCharacter } from "@brains/identity-service";
import { slugify } from "@brains/utils/string-utils";

const FALLBACK_ASSISTANT_ACTOR_ID = "brain:assistant";
const FALLBACK_ASSISTANT_DISPLAY_NAME = "Assistant";

export function createBrainAgentId(
  name: string | undefined,
): string | undefined {
  if (!name) return undefined;
  const slug = slugify(name);
  return slug ? `brain:${slug}` : undefined;
}

export function buildAssistantActor(params: {
  character: BrainCharacter;
  agentId?: string;
}): ConversationMessageActor {
  const displayName =
    params.character.name.trim() || FALLBACK_ASSISTANT_DISPLAY_NAME;

  return {
    identity: {
      kind: "agent",
      agentId: params.agentId ?? FALLBACK_ASSISTANT_ACTOR_ID,
    },
    interfaceType: "agent",
    role: "assistant",
    displayName,
    isBot: true,
  };
}
