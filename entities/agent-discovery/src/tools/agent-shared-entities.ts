import type { SharedEntity } from "@brains/contracts";
import {
  ConfirmationArgsStore,
  type Tool,
  type ToolResponse,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { extractDomain } from "../lib/extract-domain";
import {
  askPeer,
  findSharedCopy,
  readAsOwnType,
  sharedCopyId,
  storeSharedCopy,
  type Refusal,
  type SharedCopyContext,
} from "../lib/shared-copies";

const sharedEntitiesInputSchema = z.object({
  agent: z
    .string()
    .min(1)
    .describe("The saved, approved agent to ask: its id, domain or URL."),
  action: z
    .enum(["show", "take", "drop"])
    .describe(
      "show fetches one shared entity and returns its text, saving nothing. take saves it as a read-only copy. drop removes a copy this brain took.",
    ),
  entityType: z
    .string()
    .min(1)
    .optional()
    .describe("The entity's type on the peer, such as note or post."),
  id: z.string().min(1).optional().describe("The entity's id on the peer."),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
});

type SharedEntitiesInput = z.infer<typeof sharedEntitiesInputSchema>;

type SharedEntitiesContext = SharedCopyContext;

/** Ask the peer, and say why when there is nothing to take. */
async function askFor(
  context: SharedEntitiesContext,
  wanted: { agent: string; entityType: string; id: string },
): Promise<{ entity: SharedEntity } | Refusal> {
  const answer = await askPeer(context, wanted);
  if (answer.kind === "found") return { entity: answer.entity };
  if (answer.kind === "not-shared") {
    return {
      success: false,
      code: "not_found",
      error: `${wanted.agent} shares no ${wanted.entityType} "${wanted.id}" with this brain. It may not exist, or may not be shared with you.`,
    };
  }
  return { success: false, code: answer.code, error: answer.error };
}

/**
 * What an approved peer shares with this brain: the one tool for it. It
 * asks the peer over A2A's entity-sharing extension, signed, with no model
 * on either side of the request. A copy it takes is kept apart from this
 * brain's own entities, and is this brain's to read and never to edit.
 */
export function createAgentSharedEntitiesTool(
  context: SharedEntitiesContext,
): Tool {
  const toolName = "agent_shared_entities";
  const confirmations = new ConfirmationArgsStore();

  return {
    name: toolName,
    description:
      "What an approved peer brain shares with this brain. show fetches one shared entity by its type and id and returns its text, saving nothing. take saves it as a read-only copy, kept apart from this brain's own entities and readable by its trusted users. drop removes a copy this brain took. The peer serves only entities its owner marked shared, only to a brain it trusts; anything else, it answers as not found. take and drop require confirmation. Use agent_call to ask a peer a question; use this only for a specific shared entity.",
    inputSchema: sharedEntitiesInputSchema.shape,
    visibility: "admin",
    sideEffects: "external",
    handler: async (rawInput): Promise<ToolResponse> => {
      const parsed = sharedEntitiesInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        };
      }
      const input = parsed.data;
      const { action, entityType, id } = input;
      if (!entityType || !id) {
        return {
          success: false,
          error: `${action} needs the entity's entityType and id.`,
        };
      }
      const agent = (
        extractDomain(input.agent) || input.agent.trim()
      ).toLowerCase();
      const wanted = { agent, entityType, id };

      if (action === "show") {
        const asked = await askFor(context, wanted);
        if ("success" in asked) return asked;
        return {
          success: true,
          data: {
            agent,
            entityType: asked.entity.entityType,
            id: asked.entity.id,
            markdown: asked.entity.markdown,
          },
        };
      }

      if (input.confirmed) {
        const validation = confirmations.validate(
          input.confirmationToken,
          input,
        );
        if (validation.status !== "ok") {
          return {
            success: false,
            error:
              "No matching pending confirmation found. Please make the request again and confirm it.",
          };
        }
      }
      const confirmation = (
        summary: string,
        preview: string,
      ): ToolResponse => ({
        needsConfirmation: true,
        toolName,
        summary,
        preview,
        args: confirmations.create<SharedEntitiesInput>(
          (confirmationToken) => ({
            agent,
            action,
            entityType,
            id,
            confirmed: true,
            confirmationToken,
          }),
        ),
      });

      const copyId = sharedCopyId(agent, entityType, id);
      if (action === "drop") {
        const copy = await findSharedCopy(context, copyId);
        if (!copy) {
          return {
            success: false,
            code: "no_copy",
            error: `This brain holds no copy of ${entityType} "${id}" from ${agent}.`,
          };
        }
        if (!input.confirmed) {
          return confirmation(
            `Drop the copy of ${entityType} "${id}" from ${agent}?`,
            `The copy is removed from this brain. ${agent} still has its own.`,
          );
        }
        await context.entityService.deleteEntity({
          entityType: copy.entityType,
          id: copy.id,
        });
        return {
          success: true,
          data: { agent, entityType, id, dropped: true },
        };
      }

      // take: the peer is asked on both calls, so what is confirmed is what
      // the peer serves when the copy is stored.
      const asked = await askFor(context, wanted);
      if ("success" in asked) return asked;
      const readable = readAsOwnType(context, asked.entity);
      if (!readable.ok) {
        return { success: false, code: readable.code, error: readable.error };
      }
      if (!input.confirmed) {
        return confirmation(
          `Take a read-only copy of ${entityType} "${id}" from ${agent}?`,
          `"${readable.title}" is saved as a read-only copy, apart from this brain's own entities and readable by its trusted users. It is kept current while ${agent} shares it.`,
        );
      }
      const stored = await storeSharedCopy(context, agent, asked.entity);
      if (!stored.ok) {
        return { success: false, code: stored.code, error: stored.error };
      }
      return {
        success: true,
        data: {
          copyId: stored.copyId,
          agent,
          entityType,
          id,
          title: stored.title,
        },
      };
    },
  };
}
