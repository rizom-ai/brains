import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import type {
  EntityCreateContext,
  EntityCreateRouting,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import type {
  MemorySource,
  decisionMetadataSchema,
  insightMetadataSchema,
} from "../schemas/conversation-memory";

/** What a route decides: the record to store, or why it stores none. */
type MemoryResolution =
  | { create: { id: string; content: string; metadata: MemorySource } }
  | { refuse: string };

/** How a kind of memory is named when a request for one is refused. */
interface MemoryWords {
  /** With its article and a capital, e.g. "A decision". */
  named: string;
  /** What was done to arrive at one, e.g. "decided". */
  reached: string;
}

/** A leading heading and what follows it; no title for text that opens without one. */
function headed(text: string): { title?: string; body: string } {
  const [first = "", ...rest] = text.trim().split("\n");
  const title = first.match(/^#\s+(.+)$/)?.[1]?.trim();
  return title
    ? { title, body: rest.join("\n").trim() }
    : { body: text.trim() };
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0]?.trim() ?? "";
}

/**
 * A decision or an insight recorded by hand: a heading and what was said,
 * active, and from the conversation it was said in when it was said in one.
 * It names nobody: whoever records one need not have decided or found it.
 * A create route cannot set visibility and an unstated one is public, so a
 * request that states none, or public, is refused.
 */
async function resolveMemory(
  words: MemoryWords,
  context: EntityCreateContext,
): Promise<MemoryResolution> {
  const { input } = context;
  if (input.visibility === undefined || input.visibility === "public") {
    return {
      refuse: `${words.named} is the team's memory and is never public: state its visibility as shared or restricted.`,
    };
  }
  const said = headed(input.content ?? input.prompt ?? "");
  // The first that says something: the title given, the text's heading,
  // or its first line.
  const title =
    [input.title?.trim(), said.title, firstLine(said.body)].find(
      (candidate) => candidate !== undefined && candidate.length > 0,
    ) ?? "";
  const id = slugify(title);
  if (!id) {
    return {
      refuse: `${words.named} needs a title or the text of what was ${words.reached}.`,
    };
  }
  const text = said.body === title ? "" : said.body;

  const caller = entityRuntime(context).caller;
  const source =
    caller.conversationId !== undefined && caller.channelId !== undefined
      ? {
          conversationId: caller.conversationId,
          channelId: caller.channelId,
          interfaceType: caller.interfaceType,
          ...(caller.channelName !== undefined && {
            channelName: caller.channelName,
          }),
        }
      : {};
  return {
    create: {
      id,
      content: text ? `# ${title}\n\n${text}` : `# ${title}`,
      metadata: { ...source, status: "active" },
    },
  };
}

/** One described in words or stated as text reaches the same record. */
function memoryCreateRoutes(words: MemoryWords): {
  fromPrompt: {
    resolve(context: EntityCreateContext): Promise<MemoryResolution>;
  };
  fromContent: {
    resolve(context: EntityCreateContext): Promise<MemoryResolution>;
  };
} {
  const route = {
    resolve: (context: EntityCreateContext): Promise<MemoryResolution> =>
      resolveMemory(words, context),
  };
  return { fromPrompt: route, fromContent: route };
}

export const decisionCreateRoutes: EntityCreateRouting<
  typeof decisionMetadataSchema
> = memoryCreateRoutes({ named: "A decision", reached: "decided" });

export const insightCreateRoutes: EntityCreateRouting<
  typeof insightMetadataSchema
> = memoryCreateRoutes({ named: "An insight", reached: "learned" });
