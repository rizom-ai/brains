import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import type {
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRouting,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import type { decisionMetadataSchema } from "../schemas/conversation-memory";

type DecisionResolution = EntityCreateResolution<typeof decisionMetadataSchema>;

const NEVER_PUBLIC =
  "A decision is the team's memory and is never public: state its visibility as shared or restricted.";
const NOTHING_SAID =
  "A decision needs a title or the text of what was decided.";

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
 * A decision recorded by hand: a heading and what was decided, active, and
 * from the conversation it was said in when it was said in one. It states
 * no decider: whoever records a decision need not have made it.
 */
async function resolveDecision(
  context: EntityCreateContext,
): Promise<DecisionResolution> {
  const { input } = context;
  if (input.visibility === undefined || input.visibility === "public") {
    return { refuse: NEVER_PUBLIC };
  }
  const said = headed(input.content ?? input.prompt ?? "");
  // The first that says something: the title given, the text's heading,
  // or its first line.
  const title =
    [input.title?.trim(), said.title, firstLine(said.body)].find(
      (candidate) => candidate !== undefined && candidate.length > 0,
    ) ?? "";
  const id = slugify(title);
  if (!id) return { refuse: NOTHING_SAID };
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

/** A decision described in words or stated as text reaches the same record. */
export const decisionCreateRoutes: EntityCreateRouting<
  typeof decisionMetadataSchema
> = {
  fromPrompt: { resolve: resolveDecision },
  fromContent: { resolve: resolveDecision },
};
