import type { ConversationMessageActor } from "@brains/conversation-service";
import type { BrainCharacter } from "@brains/identity-service";
import { slugify } from "@brains/utils";

const FALLBACK_ASSISTANT_ACTOR_ID = "brain:assistant";
const FALLBACK_ASSISTANT_DISPLAY_NAME = "Assistant";

export function createBrainActorId(
  name: string | undefined,
): string | undefined {
  if (!name) return undefined;
  const slug = slugify(name);
  return slug ? `brain:${slug}` : undefined;
}

export function buildAssistantActor(params: {
  character: BrainCharacter;
  actorId?: string;
}): ConversationMessageActor {
  const displayName =
    params.character.name.trim() || FALLBACK_ASSISTANT_DISPLAY_NAME;

  return {
    actorId: params.actorId ?? FALLBACK_ASSISTANT_ACTOR_ID,
    interfaceType: "agent",
    role: "assistant",
    displayName,
    isBot: true,
  };
}
