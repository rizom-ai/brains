import type { BaseEntity } from "@brains/sdk/entities";
import { A2A_CHANNELS } from "@brains/contracts";
import { messageErrorCodeSchema } from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import type { StudioRequestAccess } from "./editor-contracts";
import { requireEntityAction } from "./editor-access";
import { zodFieldToStudioWidget } from "./config";
import { splitEntityContent } from "./editor-content";
import { jsonResponse } from "./editor-response";
import type { StudioRuntime } from "./runtime";

const assistContextShape = {
  entityType: z.string(),
  id: z.string(),
};

const assistPayloadSchema = z.union([
  z.object({
    ...assistContextShape,
    variant: z.literal("rewrite").optional(),
    instruction: z.string().trim().min(1),
    selection: z.string().min(1).max(8_000),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("summarise"),
    targetField: z.string().trim().min(1),
  }),
  z.object({
    ...assistContextShape,
    variant: z.literal("tag-suggest"),
    targetField: z.string().trim().min(1),
  }),
]);

const assistResponseSchema = z.object({
  suggestion: z.string(),
});

const tagAssistResponseSchema = z.object({
  suggestions: z.array(z.string().trim().min(1)).max(12),
});

const askAgentPayloadSchema = z.object({
  entityType: z.string(),
  id: z.string(),
  selection: z.string().min(1).max(8_000),
  instruction: z.string().trim().min(1).max(2_000),
  agent: z.string().trim().min(1).max(253),
});

/** What the bus answers, when something answered at all. */
// A send nobody answers comes back as a success with nothing in it.
const busAnswerSchema = z.union([
  z.looseObject({ success: z.literal(true), data: z.unknown().optional() }),
  z.looseObject({
    success: z.literal(false),
    error: z.string().optional(),
    code: messageErrorCodeSchema.optional(),
  }),
]);

const a2aCallResultSchema = z.looseObject({
  response: z.string(),
});

const a2aAgentListSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});

interface StudioAssistEntityContext {
  entity: BaseEntity;
  frontmatter: Record<string, unknown>;
  body: string;
}

async function resolveStudioAssistEntity(
  runtime: StudioRuntime,
  entityType: string,
  id: string,
  access: StudioRequestAccess,
): Promise<StudioAssistEntityContext | Response> {
  if (!runtime.shapes.frontmatterSchema(entityType)) {
    return jsonResponse({ error: `Unknown entity type: ${entityType}` }, 404);
  }
  const entity = await runtime.entities.getEntity({
    entityType,
    id,
    visibilityScope: access.visibilityScope,
  });
  if (!entity) {
    return jsonResponse({ error: `Entity not found: ${id}` }, 404);
  }
  const denied = requireEntityAction(
    runtime.operator,
    entityType,
    "update",
    access,
  );
  if (denied) return denied;
  const content = splitEntityContent(entityType, entity.content);
  return { entity, ...content };
}

function requireStoredSelection(
  context: StudioAssistEntityContext,
  selection: string,
): Response | null {
  return context.body.includes(selection)
    ? null
    : jsonResponse(
        { error: "Selection no longer matches the stored entity" },
        409,
      );
}

export async function handleAssist(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof assistPayloadSchema>;
  try {
    payload = assistPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid assist payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveStudioAssistEntity(
    runtime,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const frontmatterSchema = runtime.shapes.frontmatterSchema(
    payload.entityType,
  );
  if (!frontmatterSchema) {
    return jsonResponse(
      { error: `Unknown entity type: ${payload.entityType}` },
      404,
    );
  }

  if (payload.variant === "summarise" || payload.variant === "tag-suggest") {
    const fieldSchema = frontmatterSchema.shape[payload.targetField];
    if (!fieldSchema) {
      return jsonResponse(
        { error: `Unknown frontmatter field: ${payload.targetField}` },
        400,
      );
    }
    const descriptor = zodFieldToStudioWidget(payload.targetField, fieldSchema);
    const compatible =
      payload.variant === "summarise"
        ? descriptor.widget === "string" || descriptor.widget === "text"
        : descriptor.widget === "list" && descriptor.field?.widget === "string";
    if (!compatible) {
      return jsonResponse(
        {
          error: `Field ${payload.targetField} is incompatible with ${payload.variant}`,
        },
        400,
      );
    }

    // The instruction is what to do; the material is what to do it to.
    const material = [
      `Entity type: ${payload.entityType}`,
      `Target field: ${payload.targetField}`,
      `Existing frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
      "",
      "Full markdown body:",
      entityContext.body,
    ].join("\n");

    if (payload.variant === "summarise") {
      const { verdict } = await runtime.judge({
        instruction: [
          "You are editing Studio frontmatter from an existing markdown body.",
          "Summarise the body for the target frontmatter field.",
          "Return only the field value in the suggestion field.",
        ].join("\n"),
        material,
        schema: assistResponseSchema,
      });
      return jsonResponse({
        variant: payload.variant,
        targetField: payload.targetField,
        suggestion: verdict.suggestion,
      });
    }

    const { verdict } = await runtime.judge({
      instruction: [
        "You are editing Studio frontmatter from an existing markdown body.",
        "Suggest tags for the target frontmatter field.",
        "Return concise tag strings in the suggestions field without duplicates.",
      ].join("\n"),
      material,
      schema: tagAssistResponseSchema,
    });
    return jsonResponse({
      variant: payload.variant,
      targetField: payload.targetField,
      suggestions: [...new Set(verdict.suggestions)],
    });
  }

  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;

  const { verdict } = await runtime.judge({
    instruction: [
      "You are editing markdown for the Studio.",
      "Rewrite only the selected text according to the instruction.",
      "Return only replacement markdown in the suggestion field.",
      "Do not include commentary, code fences, or unchanged surrounding body text.",
      `Instruction: ${payload.instruction}`,
    ].join("\n"),
    material: [
      `Entity type: ${payload.entityType}`,
      `Frontmatter JSON: ${JSON.stringify(entityContext.frontmatter)}`,
      "",
      "Selected markdown:",
      payload.selection,
      "",
      "Full body for context:",
      entityContext.body,
    ].join("\n"),
    schema: assistResponseSchema,
  });
  return jsonResponse({ suggestion: verdict.suggestion });
}

export async function handleListAgents(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("type");
  const id = params.get("id");
  if (!entityType || !id) {
    return jsonResponse(
      { error: "type and id query parameters are required" },
      400,
    );
  }
  const entityContext = await resolveStudioAssistEntity(
    runtime,
    entityType,
    id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;

  const answer = busAnswerSchema.safeParse(
    await runtime.messaging.send({
      type: A2A_CHANNELS.callAgents,
      payload: {
        entityType,
        entityId: entityContext.entity.id,
        actor: access.actor,
        interfaceType: "studio",
      },
    }),
  );
  if (!answer.success || !answer.data.success) {
    // No a2a interface (or no directory) means the client keeps the existing
    // model-only assist bar.
    return jsonResponse({ agents: [] });
  }

  const parsed = a2aAgentListSchema.safeParse(answer.data.data);
  return jsonResponse(parsed.success ? parsed.data : { agents: [] });
}

export async function handleAskAgent(
  runtime: StudioRuntime,
  request: Request,
  access: StudioRequestAccess,
): Promise<Response> {
  let payload: z.infer<typeof askAgentPayloadSchema>;
  try {
    payload = askAgentPayloadSchema.parse(await request.json());
  } catch {
    return jsonResponse(
      { error: "Invalid agent ask payload or selection length" },
      400,
    );
  }

  const entityContext = await resolveStudioAssistEntity(
    runtime,
    payload.entityType,
    payload.id,
    access,
  );
  if (entityContext instanceof Response) return entityContext;
  const selectionError = requireStoredSelection(
    entityContext,
    payload.selection,
  );
  if (selectionError) return selectionError;

  const answer = busAnswerSchema.safeParse(
    await runtime.messaging.send({
      type: A2A_CHANNELS.callRequest,
      payload: {
        agent: payload.agent,
        instruction: payload.instruction,
        selection: payload.selection,
        entityType: payload.entityType,
        entityId: entityContext.entity.id,
        actor: access.actor,
        interfaceType: "studio",
      },
    }),
  );
  if (!answer.success || !answer.data.success) {
    const failure = answer.success && !answer.data.success ? answer.data : null;
    const error = failure?.error ?? "Agent call failed";
    // Nothing listening means this brain has no agent to ask, which is a
    // different answer from one that tried and failed. The code says which;
    // the sentence beside it is for whoever reads the response.
    const unavailable = failure?.code === "no_handler";
    return jsonResponse(
      { error: unavailable ? "Agent asking is unavailable" : error },
      unavailable ? 503 : 400,
    );
  }

  if (answer.data.data === undefined) {
    return jsonResponse({ error: "Agent asking is unavailable" }, 503);
  }
  const parsed = a2aCallResultSchema.safeParse(answer.data.data);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid response from agent" }, 502);
  }

  return jsonResponse({
    agentId: payload.agent,
    response: parsed.data.response,
  });
}
