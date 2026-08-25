import { createTestEntityAccess } from "@brains/test-utils";
import type {
  EntityConversationReader,
  IEntityAINamespace,
  JobEntityAccess,
} from "@brains/plugins";

/**
 * The narrow halves of a mock plugin context.
 *
 * Everything in this package now takes exactly what it reads — entity
 * access, a conversation reader, the AI namespace — rather than a whole
 * plugin context. Tests still build the mock context, so this splits it the
 * way the runtime does.
 */
export function narrowContext(context: {
  entityService: Parameters<typeof createTestEntityAccess>[0]["entityService"];
  conversations: EntityConversationReader;
  ai: IEntityAINamespace;
  spaces?: readonly string[] | undefined;
}): {
  entities: JobEntityAccess;
  conversations: EntityConversationReader;
  ai: IEntityAINamespace;
  spaces: readonly string[];
} {
  return {
    entities: createTestEntityAccess({ entityService: context.entityService }),
    conversations: context.conversations,
    ai: context.ai,
    spaces: context.spaces ?? [],
  };
}
